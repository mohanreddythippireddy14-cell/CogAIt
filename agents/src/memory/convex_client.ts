import { ConvexHttpClient } from "convex/browser";

// For Cloud Run, CONVEX_URL should be in env vars
const convexUrl = process.env.CONVEX_URL || "http://127.0.0.1:3210";
export const convex = new ConvexHttpClient(convexUrl);

// Agent Internal Methods exposing specific API calls
// Example: fetching historical assignment records
export const fetchStudentHistory = async (studentId: string) => {
  // return convex.query(api.agentAPI.getHistory, { studentId });
  return [];
};

export type RemediationPreference = "pyqs" | "fundamentals" | "theory" | "all";

export interface PendingRemediationRecord {
  pending_remediation_id: string;
  assignment_id: string;
  student_id: string;
  weak_topics: string[];
  status: "accepted" | "declined" | "expired";
  preference?: RemediationPreference;
}

/**
 * Writes a new pending remediation offer to Convex in awaiting_consent state.
 */
export async function createPendingRemediationRecord(input: {
  student_id: string;
  assignment_id: string;
  weak_topics: string[];
  expires_at: number;
}): Promise<string> {
  const id = await convex.mutation("pendingRemediations:createPending" as never, input as never);
  return String(id);
}

/**
 * Applies explicit student consent/decline to an existing pending remediation record.
 */
export async function respondPendingRemediationRecord(input: {
  pending_remediation_id: string;
  student_id: string;
  consent: boolean;
  preference?: RemediationPreference;
}): Promise<{ ok: boolean; reason: string; record?: PendingRemediationRecord }> {
  const result = (await convex.mutation("pendingRemediations:respond" as never, {
    pending_remediation_id: input.pending_remediation_id,
    student_id: input.student_id,
    consent: input.consent,
    preference: input.preference,
  } as never)) as
    | {
        ok: boolean;
        reason: string;
      }
    | {
        ok: boolean;
        reason: string;
        record: {
          pending_remediation_id: string;
          assignment_id: string;
          student_id: string;
          weak_topics: string[];
          status: "accepted" | "declined" | "expired";
          preference?: RemediationPreference;
        };
      };
  if ("record" in result) {
    return {
      ok: result.ok,
      reason: result.reason,
      record: {
        pending_remediation_id: String(result.record.pending_remediation_id),
        assignment_id: result.record.assignment_id,
        student_id: result.record.student_id,
        weak_topics: result.record.weak_topics,
        status: result.record.status,
        preference: result.record.preference,
      },
    };
  }
  return { ok: result.ok, reason: result.reason };
}

/**
 * Expires all due awaiting_consent remediation offers and returns the expired records.
 */
export async function expirePendingRemediationRecords(now_ts: number): Promise<PendingRemediationRecord[]> {
  const rows = (await convex.mutation("pendingRemediations:expireDue" as never, {
    now_ts,
  } as never)) as Array<{
    pending_remediation_id: string;
    assignment_id: string;
    student_id: string;
    weak_topics: string[];
    status: "expired";
  }>;
  return rows.map((row) => ({
    pending_remediation_id: String(row.pending_remediation_id),
    assignment_id: row.assignment_id,
    student_id: row.student_id,
    weak_topics: row.weak_topics,
    status: row.status,
  }));
}

export async function appendAgentMessage(
  conversationId: string,
  content: string,
  newStatus?: "analyzing" | "negotiating" | "searching" | "active" | "closed",
  inReplyTo?: string
): Promise<void> {
  await convex.mutation("agentConversation:appendAgentMessage" as never, {
    conversationId,
    content,
    newStatus,
    inReplyTo,
  } as never);
}

export async function getOrCreateConversation(
  studentId: string,
  assignmentId: string
): Promise<string> {
  const id = await convex.mutation("agentConversation:getOrCreateConversation" as never, {
    studentId,
    assignmentId,
  } as never);
  return String(id);
}

export async function getConversation(conversationId: string): Promise<any> {
  return await convex.query("agentConversation:getConversationInternal" as never, {
    conversationId,
  } as never);
}
