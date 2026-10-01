/**
 * Consent Flow Trace (manual verification path)
 * 1) Agent 2 emits weak_topics_identified -> /webhook/weak_topics_identified
 * 2) Negotiation node stores pending remediation in Convex with status awaiting_consent
 * 3) Negotiation node emits remediation_offer_ready with pending_remediation_id
 * 4) Frontend polls Convex, shows consent UI, student clicks "PYQs"
 * 5) Frontend calls POST /negotiation/respond
 * 6) Negotiation node marks pending remediation as accepted in Convex
 * 7) Negotiation node emits remediation_requested -> Agent 3 fires
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new EnvHttpProxyAgent());
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { publishEvent } from "../pubsub/index.js";
import Groq from 'groq-sdk';
import {
  createPendingRemediationRecord,
  expirePendingRemediationRecords,
  respondPendingRemediationRecord,
  type RemediationPreference,
  getOrCreateConversation,
  appendAgentMessage,
  getConversation
} from "../memory/convex_client.js";
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import type { AssignmentAnalystOutput } from "../types/index.js";

interface RemediationOfferReadyPayload {
  student_id: string;
  weak_topics: string[];
  pending_remediation_id: string;
}

interface RemediationDeclinedPayload {
  student_id: string;
  assignment_id: string;
  weak_topics: string[];
  pending_remediation_id: string;
  reason: "student_declined" | "expired";
}

interface NegotiationResponseInput {
  pending_remediation_id: string;
  student_id: string;
  consent: boolean;
  preference?: RemediationPreference;
}

const CONSENT_WINDOW_MS = 15 * 60 * 1000;
const EXPIRY_SWEEP_INTERVAL_MS = 60 * 1000;

const app = new Hono();
app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.text('OK');
  await next();
});

const groq = new Groq({ apiKey: process.env.GOOGLE_API_KEY, baseURL: process.env.CONVEX_URL?.replace(".cloud", ".site") + "/api/gemini-proxy/" || "https://dynamic-alpaca-596.convex.site/api/gemini-proxy/" });
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
let publishEventImpl = publishEvent;

/**
 * Overrides publishEvent for local test runs.
 */
export function setPublishEventForTests(fn: typeof publishEvent): void {
  publishEventImpl = fn;
}

/**
 * Validates the consent response payload and enforces preference requirement on positive consent.
 */
function parseNegotiationResponseInput(payload: unknown): NegotiationResponseInput {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid request body.");
  }
  const record = payload as Record<string, unknown>;
  const pendingId = String(record.pending_remediation_id ?? "").trim();
  const studentId = String(record.student_id ?? "").trim();
  const consent = record.consent;
  const preference = record.preference;

  if (!pendingId) throw new Error("pending_remediation_id is required.");
  if (!studentId) throw new Error("student_id is required.");
  if (typeof consent !== "boolean") throw new Error("consent must be boolean.");

  if (consent) {
    const allowed: RemediationPreference[] = ["pyqs", "fundamentals", "theory", "all"];
    if (typeof preference !== "string" || !allowed.includes(preference as RemediationPreference)) {
      throw new Error("preference is required when consent=true.");
    }
    return {
      pending_remediation_id: pendingId,
      student_id: studentId,
      consent,
      preference: preference as RemediationPreference,
    };
  }

  return {
    pending_remediation_id: pendingId,
    student_id: studentId,
    consent,
  };
}

/**
 * Emits remediation_declined for explicit decline or expiry outcomes.
 */
async function emitRemediationDeclined(payload: RemediationDeclinedPayload): Promise<void> {
  await publishEventImpl("remediation_declined", payload);
}

/**
 * Background expiry sweep that marks stale pending offers as expired and emits decline events.
 */
export async function sweepExpiredRemediations(): Promise<void> {
  const expired = await expirePendingRemediationRecords(Date.now());
  for (const row of expired) {
    await emitRemediationDeclined({
      student_id: row.student_id,
      assignment_id: row.assignment_id,
      weak_topics: row.weak_topics,
      pending_remediation_id: row.pending_remediation_id,
      reason: "expired",
    });
  }
}

/**
 * Handles weak_topics_identified input and emits remediation_offer_ready without auto-accepting.
 */
export async function handleWeakTopicsIdentified(
  input: AssignmentAnalystOutput,
): Promise<{ status: string; pending_remediation_id?: string }> {
  const inWindow = input.time_available_for_remediation;

  if (!inWindow || !input.remediation_recommended || input.weak_topics.length === 0) {
    return { status: "offer_not_created" };
  }

  const createdAt = Date.now();
  const expiresAt = createdAt + CONSENT_WINDOW_MS;
  const pendingId = await createPendingRemediationRecord({
    student_id: input.student_id,
    assignment_id: input.assignment_id,
    weak_topics: input.weak_topics,
    expires_at: expiresAt,
  });

  const offerPayload: RemediationOfferReadyPayload = {
    student_id: input.student_id,
    weak_topics: input.weak_topics,
    pending_remediation_id: pendingId,
  };
  await publishEventImpl("remediation_offer_ready", offerPayload);

  return { status: "awaiting_consent", pending_remediation_id: pendingId };
}

app.post("/webhook/weak_topics_identified", async (c) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Negotiator') as AssignmentAnalystOutput;
    
    // We get or create the conversation
    const conversationId = await getOrCreateConversation(input.student_id, input.assignment_id);
    
    if (input.weak_topics.length > 0) {
      // Prompt the LLM to start negotiation
      const result = await groq.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: "You are a supportive Negotiator Agent. Based on the student's specific weak topics from this assignment, proactively message the student and convince them to do a quick remediation practice. Keep it conversational and under 2 sentences. Use real assignment data only." },
          { role: 'user', content: `Weak topics: ${input.weak_topics.join(', ')}. Scaffolding depth: ${JSON.stringify(input.topic_performance)}` }
        ],
        temperature: 0.7
      });
      const aiMsgRaw = result.choices[0]?.message?.content || "It looks like you struggled a bit. Would you like to do some practice questions to strengthen these areas?";
      const aiMsg = await runPostExecutionHooks<string>(aiMsgRaw, 'Negotiator');
      await appendAgentMessage(conversationId, aiMsg, "negotiating");
    } else {
      await appendAgentMessage(conversationId, "Great job on the assignment! You have no weak topics to review.", "closed");
    }
    
    // Still run the old logic to create the pending record under the hood
    const result = await handleWeakTopicsIdentified(input);
    return c.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown negotiation error";
    console.error("[NegotiationNode] Error:", message);
    return c.json({ error: message }, 500);
  }
});

app.post("/webhook/student_reply", async (c) => {
  try {
    const payload = await c.req.json();
    await runPreExecutionHooks(payload, 'Negotiator');
    const { conversation_id, message, student_id, message_id } = payload;
    
    // Fetch chat history
    const conversation = await getConversation(conversation_id);
    if (!conversation) return c.json({ error: "No conversation found" }, 404);
    
    // Check if we already replied to this message_id locally before calling LLM
    if (message_id && conversation.messages.some((m: any) => m.role === 'agent' && m.inReplyTo === message_id)) {
      return c.json({ success: true, idempotent: true });
    }
    
    // Pass history to LLM
    const messages = conversation.messages.map((m: any) => ({
      role: m.role === 'agent' ? 'assistant' : 'user',
      content: m.content
    }));
    
    messages.unshift({ role: 'system', content: 'You are a supportive Negotiator Agent. The student just replied to your offer for remediation practice. If they agree or say yes, respond exactly with "AGREED". If they say "do it later", "later", or want to postpone, respond exactly with "POSTPONED". If they explicitly refuse or say a clear "no", or if this is the 3rd turn of negotiation, respond exactly with "DECLINED". Otherwise, gently persuade them in 1-2 sentences using real assignment data.' });
    
    const result = await groq.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.5
    });
    
    const aiResponseRaw = result.choices[0]?.message?.content || "";
    const aiResponse = await runPostExecutionHooks<string>(aiResponseRaw, 'Negotiator');
    
    if (aiResponse.includes("AGREED")) {
      await appendAgentMessage(conversation_id, "Awesome! I'm pulling up the best practice materials for you right now...", "searching", message_id);
      
      await publishEventImpl("remediation_requested", {
        student_id: student_id,
        conversation_id: conversation_id,
        weak_topics: [], // Ideally parsed from DB
        remediation_preference: "pyqs",
        time_available_minutes: 30,
      });
    } else if (aiResponse.includes("POSTPONED")) {
      await appendAgentMessage(conversation_id, "No worries, we can tackle this later.", "closed", message_id);
      // Add logic to store postponed outcome
      await publishEventImpl("remediation_postponed", { student_id });
    } else if (aiResponse.includes("DECLINED")) {
      await appendAgentMessage(conversation_id, "Alright, we'll skip it for now. Let me know if you change your mind!", "closed", message_id);
      await publishEventImpl("remediation_declined", { student_id, reason: "student_declined" });
    } else {
      await appendAgentMessage(conversation_id, aiResponse, "negotiating", message_id);
    }
    
    return c.json({ success: true });
  } catch (err) {
    console.error("Student reply error", err);
    return c.json({ error: "Failed" }, 500);
  }
});

/**
 * Applies student consent/decline and emits remediation_requested or remediation_declined.
 */
export async function handleNegotiationRespond(
  inputPayload: unknown,
): Promise<{ status: "accepted" | "declined" | "expired" | "rejected"; reason?: string }> {
  const input = parseNegotiationResponseInput(inputPayload);
  const result = await respondPendingRemediationRecord(input);
  if (!result.ok || !result.record) {
    return { status: "rejected", reason: result.reason };
  }

  if (result.record.status === "accepted" && input.consent && input.preference) {
    await publishEventImpl("remediation_requested", {
      student_id: result.record.student_id,
      weak_topics: result.record.weak_topics,
      remediation_preference: input.preference,
      time_available_minutes: 30,
    });
    return { status: "accepted" };
  }

  await emitRemediationDeclined({
    student_id: result.record.student_id,
    assignment_id: result.record.assignment_id,
    weak_topics: result.record.weak_topics,
    pending_remediation_id: result.record.pending_remediation_id,
    reason: result.record.status === "expired" ? "expired" : "student_declined",
  });
  return { status: result.record.status };
}

app.post("/negotiation/respond", async (c) => {
  try {
    const result = await handleNegotiationRespond(await c.req.json());
    if (result.status === "rejected") {
      return c.json({ success: false, reason: result.reason }, 400);
    }
    return c.json({ success: true, status: result.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown response handling error";
    console.error("[NegotiationNode] /negotiation/respond error:", message);
    return c.json({ error: message }, 500);
  }
});

app.post("/schedule/expire_pending", async (c) => {
  try {
    await sweepExpiredRemediations();
    return c.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown expiry error";
    return c.json({ error: message }, 500);
  }
});

app.post("/webhook/remediation_offer_ready", async (c) => {
  const payload = (await c.req.json()) as RemediationOfferReadyPayload;
  console.log(`[NegotiationNode] remediation_offer_ready received for ${payload.student_id}`);
  return c.json({ success: true });
});

app.post("/webhook/remediation_declined", async (c) => {
  const payload = (await c.req.json()) as RemediationDeclinedPayload;
  console.log(`[NegotiationNode] remediation_declined received for ${payload.student_id} (${payload.reason})`);
  return c.json({ success: true });
});

setInterval(() => {
  void sweepExpiredRemediations().catch((err) => {
    const message = err instanceof Error ? err.message : "Unknown expiry sweep error";
    console.error("[NegotiationNode] expiry sweep failed:", message);
  });
}, EXPIRY_SWEEP_INTERVAL_MS);

const port = 8089;
console.log(`[negotiation_node] Starting on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
