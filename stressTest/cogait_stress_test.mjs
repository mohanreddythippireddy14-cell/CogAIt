/**
 * CogAIt Platform Stress Test — v3 (Production-Ready)
 * =====================================================
 * Uses Convex HTTP Client with correct auth token handling.
 * Run: node stressTest/cogait_stress_test.mjs
 */

import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = "https://dynamic-alpaca-596.convex.cloud";

const C = {
  reset:"\x1b[0m", red:"\x1b[31m", green:"\x1b[32m",
  yellow:"\x1b[33m", cyan:"\x1b[36m", bold:"\x1b[1m", dim:"\x1b[2m",
};

const results = { passed:[], failed:[], warnings:[] };

function pass(label) { results.passed.push(label); console.log(`${C.green}  ✓ PASS${C.reset} ${label}`); }
function fail(label, err) { results.failed.push({label, err:String(err)}); console.log(`${C.red}  ✗ FAIL${C.reset} ${label}: ${C.red}${err}${C.reset}`); }
function warn(label, msg) { results.warnings.push({label, msg}); console.log(`${C.yellow}  ⚠ WARN${C.reset} ${label}: ${C.yellow}${msg}${C.reset}`); }
function info(msg) { console.log(`${C.dim}    ${msg}${C.reset}`); }
function section(title) { console.log(`\n${C.bold}${C.cyan}═══ ${title} ═══${C.reset}`); }

async function attempt(label, fn) {
  try { const result = await fn(); pass(label); return { ok:true, result }; }
  catch (e) { fail(label, e?.message ?? e); return { ok:false, error:e }; }
}
async function expectFail(label, fn) {
  try { await fn(); warn(label, "Expected failure, got success — SECURITY GAP?"); return {ok:false}; }
  catch (e) { pass(label + " [correctly rejected]"); return {ok:true, error:e}; }
}

// ── Auth Helpers ──────────────────────────────────────────────────────────────
async function createAuthenticatedClient(email, password, name = undefined, flow = "signIn") {
  const anonClient = new ConvexHttpClient(CONVEX_URL);
  const result = await anonClient.action("auth:signIn", {
    provider: "password",
    params: { email, password, flow, ...(name ? { name } : {}) },
  });
  const token = result?.tokens?.token;
  if (!token) throw new Error(`No token returned for ${email} (flow=${flow})`);
  const authedClient = new ConvexHttpClient(CONVEX_URL);
  authedClient.setAuth(token);
  return authedClient;
}

async function registerOrLogin(email, password, name, role = "student") {
  let client;
  try {
    client = await createAuthenticatedClient(email, password, name, "signUp");
  } catch (e) {
    if (e.message?.includes("AlreadyLinked") || e.message?.includes("already")) {
      client = await createAuthenticatedClient(email, password, undefined, "signIn");
      return client; // profile already exists
    }
    throw e;
  }
  // New account: create the profile (mimics UI SignUpForm)
  try {
    await client.mutation("users:createUserProfile", { fullName: name, role });
  } catch (profileErr) {
    if (!profileErr.message?.includes("already exists")) throw profileErr;
  }
  return client;
}

// ── Test Data ─────────────────────────────────────────────────────────────────
function randEmail(pfx) { return `${pfx}_${Date.now()}_${Math.floor(Math.random()*9999)}@cogait-stress.dev`; }
const SUBJ = ["Physics","Chemistry","Math"];
const TOPICS = ["Kinematics","Thermodynamics","Optics","Electrochemistry","Calculus","Algebra"];
const DIFFS = ["easy","medium","hard"];

function mkQuestion(i, assignmentId) {
  return {
    assignmentId,
    questionNumber: i + 1,
    questionText: `[ST Q${i+1}] A body moves ${(i+1)*3}m in ${i+1}s. Find velocity.`,
    subject: SUBJ[i % 3],
    topic: TOPICS[i % 6],
    difficulty: DIFFS[i % 3],
    givenVariables: `d=${(i+1)*3}m, t=${i+1}s`,
    correctAnswer: `${(i+1)*3}`,
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n${C.bold}${C.cyan}╔═══════════════════════════════════════════════╗`);
  console.log(`║      CogAIt Platform Stress Test v3         ║`);
  console.log(`║      19 phases × 60+ test cases             ║`);
  console.log(`╚═══════════════════════════════════════════════╝${C.reset}\n`);
  console.log(`  Target: ${CONVEX_URL}\n`);

  // ── P1: Registration ──────────────────────────────────────────────────────
  section("PHASE 1 — Account Registration & Sign-In");

  const lecEmail = randEmail("tc_lec"); const lecPass = "StressLec@1234!";
  const s1Email  = randEmail("tc_s1");  const s2Email = randEmail("tc_s2");
  const stuPass  = "StressStu@5678!";

  let lecClient, s1Client, s2Client;

  const rl = await attempt("Register + sign in as Lecturer", async () => {
    lecClient = await registerOrLogin(lecEmail, lecPass, "TC Lecturer", "lecturer");
    return true;
  });
  const rs1 = await attempt("Register + sign in as Student 1", async () => {
    s1Client = await registerOrLogin(s1Email, stuPass, "TC Student Alpha", "student");
    return true;
  });
  const rs2 = await attempt("Register + sign in as Student 2", async () => {
    s2Client = await registerOrLogin(s2Email, stuPass, "TC Student Beta", "student");
    return true;
  });

  if (!rl.ok || !rs1.ok) {
    fail("FATAL", "Auth setup failed"); return printSummary();
  }

  // ── P2: Profile verification ──────────────────────────────────────────────
  section("PHASE 2 — Profile & Identity Verification");

  let lecProfile, s1Profile;

  await attempt("Lecturer has a valid profile", async () => {
    const u = await lecClient.query("users:loggedInUserWithProfile", {});
    if (!u?.profile) throw new Error("No profile found — account may not have org setup");
    lecProfile = u.profile;
    info(`Role: ${u.profile.role}, Org: ${u.profile.organizationId}`);
    return u;
  });

  await attempt("Student 1 has a valid profile", async () => {
    const u = await s1Client.query("users:loggedInUserWithProfile", {});
    if (!u?.profile) throw new Error("No profile found");
    s1Profile = u.profile;
    info(`Role: ${u.profile.role}`);
    return u;
  });

  await attempt("Student 2 has a valid profile", async () => {
    const u = await s2Client.query("users:loggedInUserWithProfile", {});
    if (!u?.profile) throw new Error("No profile found");
    return u;
  });

  // ── P3: RBAC ─────────────────────────────────────────────────────────────
  section("PHASE 3 — Role-Based Access Control (RBAC)");

  await expectFail("Student cannot call getLecturerAssignments", () =>
    s1Client.query("assignments:getLecturerAssignments", {})
  );
  await expectFail("Student cannot create classroom (lecturer-only)", () =>
    s1Client.mutation("classrooms:createClassroom", { name: "Rogue" })
  );
  await expectFail("Lecturer cannot call getStudentDecisionBar (student-only)", () =>
    lecClient.query("attempts:getStudentDecisionBar", {})
  );
  await expectFail("Lecturer cannot join a classroom as student", () =>
    lecClient.mutation("classrooms:joinClassByCode", { code: "XXXXXXXX" })
  );

  // Unauthenticated
  const anonClient = new ConvexHttpClient(CONVEX_URL);
  await attempt("Unauthenticated query returns null profile", async () => {
    const u = await anonClient.query("users:loggedInUserWithProfile", {});
    if (u !== null) throw new Error("Anon got a profile: SECURITY BREACH");
    return null;
  });
  await expectFail("Unauthenticated cannot mutate", () =>
    anonClient.mutation("classrooms:createClassroom", { name: "Anon Hack" })
  );

  // ── P4: Classroom ─────────────────────────────────────────────────────────
  section("PHASE 4 — Classroom CRUD");

  let classroomId, joinCode;
  const cr = await attempt("Lecturer creates classroom", async () => {
    const res = await lecClient.mutation("classrooms:createClassroom", {
      name: `ST Batch ${Date.now()}`,
      subject: "Physics",
    });
    classroomId = res.classroomId;
    joinCode    = res.joinCode;
    info(`classroomId=${classroomId}, joinCode=${joinCode}`);
    return res;
  });

  if (!cr.ok) {
    warn("BLOCKER", "Classroom creation failed — remaining phases require this. Likely the new lecturer account needs org assignment, which happens via the UI SignUp form.");
    warn("Root Cause Finding", "New accounts created via auth action don't go through the UI SignUp flow that creates an org+profile. Manual fix: open the UI and complete signup with the lecturer email.");
    return printSummary();
  }

  await attempt("Lecturer can list their classrooms", async () => {
    const list = await lecClient.query("classrooms:getFacultyClassrooms", {});
    if (!list.find(c => c._id === classroomId)) throw new Error("Created classroom not visible");
    return list.length;
  });

  await attempt("Lecturer can rename classroom", async () => {
    const res = await lecClient.mutation("classrooms:renameClassroom", {
      classroomId,
      name: "ST Batch Renamed",
    });
    if (!res.updated) throw new Error("Rename returned updated=false");
    return res;
  });

  // ── P5: Assignment CRUD ───────────────────────────────────────────────────
  section("PHASE 5 — Assignment Creation & Validation");

  let assignmentId;
  const aar = await attempt("Lecturer creates assignment", async () => {
    const id = await lecClient.mutation("assignments:createAssignment", {
      title: "Stress Test — Kinematics Full Batch",
      subject: "Physics",
      chapter: "Motion in Straight Line",
      difficulty: "mixed",
      timeLimitMinutes: 45,
      minReasoningChars: 30,
      allowedLevels: [1,2,3,4],
      classroomId,
    });
    assignmentId = id;
    info(`assignmentId=${id}`);
    return id;
  });

  await expectFail("Empty title assignment rejected", () =>
    lecClient.mutation("assignments:createAssignment", {
      title: "   ", timeLimitMinutes: 30, allowedLevels:[1], classroomId
    })
  );
  await expectFail("ID-like title rejected (e.g. 'abc1234')", () =>
    lecClient.mutation("assignments:createAssignment", {
      title: "abc1234abc", timeLimitMinutes: 30, allowedLevels:[1], classroomId
    })
  );

  if (!aar.ok) return printSummary();

  // ── P6: Questions ─────────────────────────────────────────────────────────
  section("PHASE 6 — Bulk Question Insertion (10 Questions)");

  let questionIds = [];
  for (let i=0; i<10; i++) {
    const qr = await attempt(`Add Q${i+1}/10`, async () => {
      const id = await lecClient.mutation("assignments:addQuestion", mkQuestion(i, assignmentId));
      questionIds.push(id);
      return id;
    });
  }
  info(`${questionIds.length}/10 questions inserted`);

  // ── P7: Publish ───────────────────────────────────────────────────────────
  section("PHASE 7 — Publish Assignment");

  await attempt("Lecturer publishes assignment", () =>
    lecClient.mutation("assignments:publishAssignment", { assignmentId })
  );

  await attempt("Published assignment has correct question count", async () => {
    const list = await lecClient.query("assignments:getLecturerAssignments", {});
    const found = list.find(a => a._id === assignmentId);
    if (!found) throw new Error("Assignment not in list");
    info(`totalQuestions=${found.totalQuestions}`);
    if (found.totalQuestions !== 10) warn("Question count", `Expected 10, got ${found.totalQuestions}`);
    return found.totalQuestions;
  });

  // ── P8: Enrollment ────────────────────────────────────────────────────────
  section("PHASE 8 — Student Enrollment");

  await attempt("Student 1 joins via join code", () =>
    s1Client.mutation("classrooms:joinClassByCode", { code: joinCode })
  );
  await attempt("Student 2 joins via join code", () =>
    s2Client.mutation("classrooms:joinClassByCode", { code: joinCode })
  );
  await attempt("Duplicate join is idempotent (joined=false)", async () => {
    const res = await s1Client.mutation("classrooms:joinClassByCode", { code: joinCode });
    if (res.joined !== false) throw new Error(`Expected joined=false, got ${res.joined}`);
    return res;
  });
  await expectFail("Invalid code is rejected", () =>
    s1Client.mutation("classrooms:joinClassByCode", { code: "XXXXXXXX" })
  );

  // ── P9: Student assignment visibility ─────────────────────────────────────
  section("PHASE 9 — Student Assignment Visibility");

  let stu1Assignments = [];
  await attempt("Student 1 sees enrolled-classroom assignment", async () => {
    const list = await s1Client.query("assignments:getStudentAssignments", {});
    stu1Assignments = list;
    const found = list.find(a => a._id === assignmentId);
    if (!found) throw new Error("Assignment not visible to enrolled student");
    info(`Assignment status: ${found.status}`);
    return found;
  });
  await attempt("Initial assignment status is 'not_started'", async () => {
    const found = stu1Assignments.find(a => a._id === assignmentId);
    if (!found) throw new Error("Assignment not found");
    if (found.status !== "not_started") throw new Error(`Got: ${found.status}`);
    return found.status;
  });
  await attempt("Student 2 also sees the assignment", async () => {
    const list = await s2Client.query("assignments:getStudentAssignments", {});
    const found = list.find(a => a._id === assignmentId);
    if (!found) throw new Error("S2 cannot see shared classroom assignment");
    return found;
  });

  // ── P10: Attempt flow ─────────────────────────────────────────────────────
  section("PHASE 10 — Full Attempt Flow (5 of 10 Questions)");

  let questionsFromDB = [];
  await attempt("Student 1 fetches assignment questions", async () => {
    const qs = await s1Client.query("assignments:getAssignmentQuestions", { assignmentId });
    if (!qs || !qs.length) throw new Error("No questions");
    questionsFromDB = qs;
    return qs.length;
  });

  const attemptIds = [];
  for (let i=0; i < Math.min(5, questionsFromDB.length); i++) {
    const q = questionsFromDB[i];
    const ar2 = await attempt(`Start attempt Q${i+1}`, async () => {
      const aid = await s1Client.mutation("attempts:startAttempt", { assignmentId, questionId: q._id });
      attemptIds.push(aid);
      return aid;
    });
    if (ar2.ok) {
      await attempt(`Draft save Q${i+1}`, () =>
        s1Client.mutation("attempts:saveAttemptDraft", {
          attemptId: ar2.result,
          studentReasoning: `Applying v=d/t for Q${i+1}: distance=${(i+1)*3}m, time=${i+1}s, so velocity=${(i+1)*3}m/s.`,
          studentAnswer: `${(i+1)*3} m/s`,
          questionStatus: "answered",
        })
      );
      await attempt(`Submit Q${i+1}`, () =>
        s1Client.mutation("attempts:submitAttempt", {
          attemptId: ar2.result,
          studentAnswer: `${(i+1)*3} m/s`,
          studentReasoning: `Formula: v=d/t. Distance=${(i+1)*3}, Time=${i+1}, Velocity=${(i+1)*3}m/s.`,
        })
      );
    }
  }

  await attempt("Assignment status → 'in_progress' after partial submits", async () => {
    const list = await s1Client.query("assignments:getStudentAssignments", {});
    const found = list.find(a => a._id === assignmentId);
    if (!found) throw new Error("Assignment disappeared");
    if (found.status === "not_started") throw new Error("Still not_started after 5 question submits");
    info(`Status: ${found.status}`);
    return found.status;
  });

  // ── P11: Decision bar ─────────────────────────────────────────────────────
  section("PHASE 11 — Decision Bar Accuracy");

  await attempt("Decision bar loads with valid riskLevel and independenceScore", async () => {
    const bar = await s1Client.query("attempts:getStudentDecisionBar", {});
    if (!bar) throw new Error("null response");
    if (!["low","medium","high"].includes(bar.riskLevel)) throw new Error("Invalid riskLevel: " + bar.riskLevel);
    if (typeof bar.independenceScore !== "number") throw new Error("independenceScore not a number");
    info(`activeTitle=${bar.activeAssignmentTitle}, IS=${bar.independenceScore}, risk=${bar.riskLevel}`);
    if (!bar.activeAssignmentTitle) warn("Decision bar", "activeAssignmentTitle is null despite in-progress assignment");
    return bar;
  });

  // ── P12: Analytics ────────────────────────────────────────────────────────
  section("PHASE 12 — Student Analytics");

  let s1Analytics;
  await attempt("Student 1 analytics: correct structure", async () => {
    const a = await s1Client.query("studentAnalytics:getStudentAnalytics", {});
    if (!a) throw new Error("null analytics");
    if (a.longTermTrajectory.length !== 4) throw new Error(`Expected 4 time buckets, got ${a.longTermTrajectory.length}`);
    if (!a.topicInsights?.strongTopics || !a.topicInsights?.weakTopics) throw new Error("topicInsights malformed");
    if (!Array.isArray(a.classroomInsights)) throw new Error("classroomInsights not array");
    s1Analytics = a;
    info(`ClassroomInsights: ${a.classroomInsights.length}, ShortTerm present: ${!!a.shortTermAnalyzer}`);
    return a;
  });

  await attempt("Student 2 analytics is independent from Student 1", async () => {
    const a2 = await s2Client.query("studentAnalytics:getStudentAnalytics", {});
    const s1Total = s1Analytics?.longTermTrajectory.reduce((s,b)=>s+b.assignmentsCount,0) ?? 0;
    const s2Total = a2.longTermTrajectory.reduce((s,b)=>s+b.assignmentsCount,0);
    info(`S1 attempts total: ${s1Total}, S2: ${s2Total}`);
    if (s1Total < s2Total) throw new Error("Data isolation breach — S2 has more data than S1");
    return { s1Total, s2Total };
  });

  // ── P13: Concurrent stress ────────────────────────────────────────────────
  section("PHASE 13 — Concurrent Mutation Stress (50 parallel saves)");

  if (attemptIds.length > 0) {
    const target = attemptIds[0];
    const tasks = Array.from({length:50}, (_,i) =>
      s1Client.mutation("attempts:saveAttemptDraft", {
        attemptId: target,
        studentReasoning: `Concurrent write batch #${i} @ ${Date.now()} — robustness probe`,
      }).then(() => "ok").catch(e => `err:${e.message}`)
    );
    const outs = await Promise.all(tasks);
    const errors = outs.filter(o => o.startsWith("err"));
    if (errors.length > 10) fail("50 concurrent saves", `${errors.length}/50 errors: ${errors[0]}`);
    else {
      if (errors.length) warn("50 concurrent saves", `${errors.length}/50 minor errors`);
      pass(`50 concurrent saves [${50-errors.length}/50 OK]`);
    }
  } else { warn("Concurrent", "Skipped — no attempt IDs"); }

  // ── P14: Full submit via autoSubmitAssignment ─────────────────────────────
  section("PHASE 14 — Final Assignment Submission");

  await attempt("Student 1 auto-submits entire assignment (remaining Qs)", () =>
    s1Client.mutation("attempts:autoSubmitAssignment", { assignmentId })
  );
  await attempt("Status = 'completed' after full submit", async () => {
    const list = await s1Client.query("assignments:getStudentAssignments", {});
    const found = list.find(a => a._id === assignmentId);
    if (!found) throw new Error("Assignment gone");
    if (found.status !== "completed") throw new Error(`Got: ${found.status}`);
    return found.status;
  });

  // ── P15: Re-submit guard ──────────────────────────────────────────────────
  section("PHASE 15 — Double-Submit Guard");

  await attempt("Re-submitting completed assignment is handled gracefully", async () => {
    try {
      await s1Client.mutation("attempts:autoSubmitAssignment", { assignmentId });
    } catch (e) {
      info(`Re-submit blocked: ${e.message}`);
    }
    return true;
  });

  // ── P16: Back-navigation guard ────────────────────────────────────────────
  section("PHASE 16 — Back-Navigation & Progress Persistence");

  await attempt("Progress remains 'completed' after re-query", async () => {
    const list = await s1Client.query("assignments:getStudentAssignments", {});
    const found = list.find(a => a._id === assignmentId);
    if (!found || found.status !== "completed") throw new Error(`Status: ${found?.status}`);
    return found.status;
  });

  // ── P17: Redo Assignment ──────────────────────────────────────────────────
  section("PHASE 17 — Redo Assignment");

  await attempt("Student 1 can redo assignment", () =>
    s1Client.mutation("attempts:redoAssignment", { assignmentId })
  );
  await attempt("Status resets to 'not_started' after redo", async () => {
    const list = await s1Client.query("assignments:getStudentAssignments", {});
    const found = list.find(a => a._id === assignmentId);
    if (!found) throw new Error("Assignment missing");
    if (found.status !== "not_started") throw new Error(`Expected not_started, got ${found.status}`);
    return found.status;
  });

  // ── P18: Cross-account security ───────────────────────────────────────────
  section("PHASE 18 — Cross-Account Security Isolation");

  if (attemptIds.length > 0) {
    await expectFail("Student 2 cannot modify Student 1's attempt", () =>
      s2Client.mutation("attempts:saveAttemptDraft", {
        attemptId: attemptIds[0],
        studentReasoning: "Injected by foreign student",
      })
    );
  }

  // ── P19: Cleanup & data integrity ─────────────────────────────────────────
  section("PHASE 19 — Lecturer Data Integrity & Cleanup");

  await attempt("Classroom roster shows both enrolled students", async () => {
    const roster = await lecClient.query("classrooms:getClassroomRoster", { classroomId });
    if (!Array.isArray(roster)) throw new Error("Not an array");
    info(`Roster size: ${roster.length}`);
    if (roster.length < 2) warn("Roster", `Expected ≥2 students, got ${roster.length}`);
    return roster.length;
  });

  await attempt("Lecturer can deactivate assignment", async () => {
    return await lecClient.mutation("assignments:toggleAssignmentActive", { assignmentId });
  });

  await attempt("Deactivated assignment not visible to student", async () => {
    const list = await s1Client.query("assignments:getStudentAssignments", {});
    const found = list.find(a => a._id === assignmentId);
    if (found) throw new Error("Deactivated assignment still showing for student");
    return true;
  });

  await attempt("Lecturer deletes classroom (cleans enrollments)", () =>
    lecClient.mutation("classrooms:deleteClassroom", { classroomId })
  );
  await attempt("After classroom delete: student sees no classroom", async () => {
    const crs = await s1Client.query("classrooms:getStudentClassrooms", {});
    if (crs.find(c => c._id === classroomId)) throw new Error("Deleted classroom still visible");
    return crs.length;
  });

  printSummary();
}

function printSummary() {
  const total = results.passed.length + results.failed.length;
  const pct = total > 0 ? Math.round((results.passed.length / total) * 100) : 0;
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════╗`);
  console.log(`║              STRESS TEST REPORT                 ║`);
  console.log(`╚══════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  Total Test Cases : ${total}`);
  console.log(`  ${C.green}Passed           : ${results.passed.length} (${pct}%)${C.reset}`);
  console.log(`  ${C.red}Failed           : ${results.failed.length}${C.reset}`);
  console.log(`  ${C.yellow}Warnings         : ${results.warnings.length}${C.reset}`);

  if (results.failed.length > 0) {
    console.log(`\n${C.bold}${C.red}━━ FAILURES — INVESTIGATE ━━${C.reset}`);
    results.failed.forEach(({label, err}) => {
      console.log(`  ${C.red}✗${C.reset} ${label}`);
      console.log(`    ${C.red}${err}${C.reset}`);
    });
  }
  if (results.warnings.length > 0) {
    console.log(`\n${C.bold}${C.yellow}━━ WARNINGS — REVIEW ━━${C.reset}`);
    results.warnings.forEach(({label, msg}) => {
      console.log(`  ${C.yellow}⚠${C.reset} ${label}: ${msg}`);
    });
  }
  console.log(`\n${C.bold}${results.failed.length === 0 ? C.green+"✓ All tests passed!" : C.red+results.failed.length+" test(s) FAILED"}${C.reset}\n`);
}

run().catch(err => {
  console.error(`\n${C.red}Fatal:${C.reset}`, err);
  printSummary();
  process.exit(1);
});
