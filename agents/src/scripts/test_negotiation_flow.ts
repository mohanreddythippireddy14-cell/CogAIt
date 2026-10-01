import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import {
  handleNegotiationRespond,
  handleWeakTopicsIdentified,
  setPublishEventForTests,
  sweepExpiredRemediations,
} from "../middleware/negotiation_node.js";
import type { AssignmentAnalystOutput } from "../types/index.js";

type EmittedEvent = { topic: string; payload: unknown };
type RemediationPreference = "pyqs" | "fundamentals" | "theory" | "all";

const emittedEvents: EmittedEvent[] = [];
setPublishEventForTests(async (topic: string, payload: unknown) => {
  emittedEvents.push({ topic, payload });
});

const convexUrl = process.env.CONVEX_URL || "http://127.0.0.1:3210";
const convex = new ConvexHttpClient(convexUrl);

/**
 * Builds a minimal AssignmentAnalystOutput payload for negotiation input.
 */
function buildWeakTopicsPayload(params: {
  student_id: string;
  assignment_id: string;
  weak_topics: string[];
}): AssignmentAnalystOutput {
  return {
    student_id: params.student_id,
    assignment_id: params.assignment_id,
    topic_performance: [],
    weak_topics: params.weak_topics,
    strong_topics: [],
    remediation_recommended: true,
    time_available_for_remediation: true,
    session_integrity_score: 0.9,
  };
}

/**
 * Clears emitted events between scenarios.
 */
function resetEmittedEvents(): void {
  emittedEvents.splice(0, emittedEvents.length);
}

/**
 * Finds the first emitted event for a given topic.
 */
function findEvent(topic: string): EmittedEvent | undefined {
  return emittedEvents.find((event) => event.topic === topic);
}

/**
 * Asserts that no event of a given topic was emitted.
 */
function assertNoEvent(topic: string): void {
  const event = findEvent(topic);
  assert.equal(event, undefined, `Expected no ${topic} event to be emitted`);
}

/**
 * Queries Convex for awaiting remediation offers for a student/assignment.
 */
async function listAwaitingForStudent(studentId: string, assignmentId: string) {
  const rows = (await convex.query("pendingRemediations:listAwaiting" as never, {
    student_id: studentId,
    assignment_id: assignmentId,
  } as never)) as Array<{
    _id: string;
    student_id: string;
    assignment_id: string;
    weak_topics: string[];
    status: "awaiting_consent" | "accepted" | "declined" | "expired";
    created_at: number;
    expires_at: number;
  }>;
  return rows.sort((a, b) => b.created_at - a.created_at);
}

/**
 * Fetches a pending remediation record by id.
 */
async function getPendingById(pendingId: string) {
  const row = (await convex.query("pendingRemediations:getById" as never, {
    pending_remediation_id: pendingId,
  } as never)) as
    | {
        _id: string;
        student_id: string;
        assignment_id: string;
        weak_topics: string[];
        status: "awaiting_consent" | "accepted" | "declined" | "expired";
        created_at: number;
        expires_at: number;
        preference?: RemediationPreference;
      }
    | null;
  return row;
}

/**
 * Updates expires_at for a pending remediation record to simulate expiry.
 */
async function forceExpiry(pendingId: string, expiresAt: number): Promise<void> {
  await convex.mutation("pendingRemediations:updateExpiry" as never, {
    pending_remediation_id: pendingId,
    expires_at: expiresAt,
  } as never);
}

/**
 * Runs Scenario A (happy path accept) and returns a boolean pass/fail.
 */
async function runScenarioA(): Promise<{ ok: boolean; reason?: string }> {
  resetEmittedEvents();
  const payload = buildWeakTopicsPayload({
    student_id: "test_student_001",
    assignment_id: "test_assignment_001",
    weak_topics: ["Integration by Parts", "Thermodynamics - First Law"],
  });

  await handleWeakTopicsIdentified(payload);

  const awaiting = await listAwaitingForStudent(payload.student_id, payload.assignment_id);
  assert.ok(awaiting.length > 0, "Expected awaiting consent record");
  const pendingId = awaiting[0]._id;

  const offerEvent = findEvent("remediation_offer_ready");
  assert.ok(offerEvent, "Expected remediation_offer_ready event");
  assert.deepEqual(offerEvent?.payload, {
    student_id: payload.student_id,
    weak_topics: payload.weak_topics,
    pending_remediation_id: pendingId,
  });

  const respondResult = await handleNegotiationRespond({
    pending_remediation_id: pendingId,
    student_id: payload.student_id,
    consent: true,
    preference: "pyqs",
  });
  assert.equal(respondResult.status, "accepted");

  const record = await getPendingById(pendingId);
  assert.ok(record, "Expected pending remediation record");
  assert.equal(record?.status, "accepted");

  const requestedEvent = findEvent("remediation_requested");
  assert.ok(requestedEvent, "Expected remediation_requested event");
  assert.deepEqual(requestedEvent?.payload, {
    student_id: payload.student_id,
    weak_topics: payload.weak_topics,
    remediation_preference: "pyqs",
    time_available_minutes: 30,
  });

  assertNoEvent("remediation_declined");
  return { ok: true };
}

/**
 * Runs Scenario B (expiry) and returns a boolean pass/fail.
 */
async function runScenarioB(): Promise<{ ok: boolean; reason?: string }> {
  resetEmittedEvents();
  const payload = buildWeakTopicsPayload({
    student_id: "test_student_002",
    assignment_id: "test_assignment_001",
    weak_topics: ["Integration by Parts", "Thermodynamics - First Law"],
  });

  await handleWeakTopicsIdentified(payload);

  const awaiting = await listAwaitingForStudent(payload.student_id, payload.assignment_id);
  assert.ok(awaiting.length > 0, "Expected awaiting consent record");
  const pendingId = awaiting[0]._id;

  await forceExpiry(pendingId, Date.now() - 1000);
  await sweepExpiredRemediations();

  const record = await getPendingById(pendingId);
  assert.ok(record, "Expected pending remediation record");
  assert.equal(record?.status, "expired");

  const declinedEvent = findEvent("remediation_declined");
  assert.ok(declinedEvent, "Expected remediation_declined event");
  const declinedPayload = declinedEvent?.payload as {
    student_id: string;
    reason: string;
  };
  assert.equal(declinedPayload.student_id, payload.student_id);
  assert.equal(declinedPayload.reason, "expired");

  assertNoEvent("remediation_requested");
  return { ok: true };
}

/**
 * Runs Scenario C (explicit decline) and returns a boolean pass/fail.
 */
async function runScenarioC(): Promise<{ ok: boolean; reason?: string }> {
  resetEmittedEvents();
  const payload = buildWeakTopicsPayload({
    student_id: "test_student_003",
    assignment_id: "test_assignment_001",
    weak_topics: ["Integration by Parts", "Thermodynamics - First Law"],
  });

  await handleWeakTopicsIdentified(payload);

  const awaiting = await listAwaitingForStudent(payload.student_id, payload.assignment_id);
  assert.ok(awaiting.length > 0, "Expected awaiting consent record");
  const pendingId = awaiting[0]._id;

  const respondResult = await handleNegotiationRespond({
    pending_remediation_id: pendingId,
    student_id: payload.student_id,
    consent: false,
  });
  assert.equal(respondResult.status, "declined");

  const record = await getPendingById(pendingId);
  assert.ok(record, "Expected pending remediation record");
  assert.equal(record?.status, "declined");

  const declinedEvent = findEvent("remediation_declined");
  assert.ok(declinedEvent, "Expected remediation_declined event");
  assertNoEvent("remediation_requested");
  return { ok: true };
}

/**
 * Executes the full test suite and prints scenario results with summary.
 */
async function main(): Promise<void> {
  const results: Array<{ label: string; ok: boolean; reason?: string }> = [];

  try {
    await runScenarioA();
    results.push({ label: "SCENARIO A", ok: true });
    console.log("SCENARIO A: ✓ PASS");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    results.push({ label: "SCENARIO A", ok: false, reason: message });
    console.log(`SCENARIO A: ✗ FAIL — ${message}`);
  }

  try {
    await runScenarioB();
    results.push({ label: "SCENARIO B", ok: true });
    console.log("SCENARIO B: ✓ PASS");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    results.push({ label: "SCENARIO B", ok: false, reason: message });
    console.log(`SCENARIO B: ✗ FAIL — ${message}`);
  }

  try {
    await runScenarioC();
    results.push({ label: "SCENARIO C", ok: true });
    console.log("SCENARIO C: ✓ PASS");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    results.push({ label: "SCENARIO C", ok: false, reason: message });
    console.log(`SCENARIO C: ✗ FAIL — ${message}`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/3 scenarios passed`);

  if (passed !== 3) {
    process.exit(1);
  }
}

void main();
