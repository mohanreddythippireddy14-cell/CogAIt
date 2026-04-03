import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";
import { computeOverallCis } from "./domain/scoring";

function assertFaculty(role: string) {
  if (role !== "lecturer" && role !== "organizationAdmin") {
    throw new Error("Only faculty can access live session data.");
  }
}

export const updateLiveSnapshot = mutation({
  args: {
    assignmentId: v.id("assignments"),
    questionId: v.optional(v.id("questions")),
    state: v.optional(v.union(v.literal("solving"), v.literal("thinking"), v.literal("using_ai"), v.literal("stuck"))),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
    if (profile.role !== "student") {
      throw new Error("Only students can update live snapshot.");
    }
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_assignment_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId).eq("studentId", userId),
      )
      .collect();
    const latest = attempts.sort((a, b) => (b.submittedAt ?? b.startedAt) - (a.submittedAt ?? a.startedAt))[0];
    if (!latest) {
      return true;
    }
    await ctx.db.patch(latest._id, {
      questionStatus: latest.questionStatus ?? "unattempted",
    });
    return true;
  },
});

export const getLiveSessionData = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      studentId: v.id("users"),
      studentName: v.string(),
      currentQuestionNumber: v.number(),
      totalQuestions: v.number(),
      elapsedSeconds: v.number(),
      liveCis: v.number(),
      helpRequests: v.number(),
      status: v.union(v.literal("solving"), v.literal("thinking"), v.literal("using_ai"), v.literal("stuck")),
      violations: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
    assertFaculty(profile.role);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);
    if (profile.role === "lecturer" && assignment.lecturerId !== userId) {
      throw new Error("Access denied");
    }

    const progress = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();
    const questionNumberById = new Map(questions.map((q) => [q._id.toString(), q.questionNumber]));

    const locks = await ctx.db
      .query("sessionLocks")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const lockByStudent = new Map(locks.map((row) => [row.studentId.toString(), row]));

    const grouped = new Map<string, typeof attempts>();
    for (const attempt of attempts) {
      const key = attempt.studentId.toString();
      const list = grouped.get(key) ?? [];
      list.push(attempt);
      grouped.set(key, list);
    }

    const rows = await Promise.all(
      progress.map(async (row) => {
        const studentAttempts = grouped.get(row.studentId.toString()) ?? [];
        const latestAttempt = [...studentAttempts].sort((a, b) => (b.submittedAt ?? b.startedAt) - (a.submittedAt ?? a.startedAt))[0];
        const currentQuestionNumber = latestAttempt
          ? questionNumberById.get(latestAttempt.questionId.toString()) ?? 1
          : 1;
        const runningDelta = row.sessionStartedAt ? Math.max(0, Date.now() - row.sessionStartedAt) : 0;
        const elapsedSeconds = Math.max(0, Math.floor((row.activeTimeMs + runningDelta) / 1000));
        const liveCis = computeOverallCis(studentAttempts);
        const helpRequests = studentAttempts.reduce((sum, item) => sum + item.totalHelpRequests, 0);
        const lastUpdated = latestAttempt ? (latestAttempt.submittedAt ?? latestAttempt.startedAt) : row.lastUpdatedAt;
        const ageMs = Date.now() - lastUpdated;
        const status: "solving" | "thinking" | "using_ai" | "stuck" =
          ageMs > 5 * 60 * 1000
            ? "stuck"
            : (latestAttempt?.totalHelpRequests ?? 0) > 0
              ? "using_ai"
              : (latestAttempt?.studentReasoning ?? "").trim().length > 0
                ? "thinking"
                : "solving";

        const userProfile = await ctx.db
          .query("userProfiles")
          .withIndex("by_user", (q) => q.eq("userId", row.studentId))
          .first();

        const lock = lockByStudent.get(row.studentId.toString());
        return {
          studentId: row.studentId,
          studentName: userProfile?.fullName ?? "Student",
          currentQuestionNumber,
          totalQuestions: assignment.totalQuestions,
          elapsedSeconds,
          liveCis,
          helpRequests,
          status,
          violations: lock?.violationWarnings.length ?? 0,
        };
      }),
    );

    return rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
  },
});
