import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { computeFinalIndependenceScore } from "../domain/scoring";

export const getAttemptsForIndependence = internalQuery({
  args: {
    studentId: v.id("users"),
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      attemptId: v.id("attempts"),
      totalHelpRequests: v.number(),
      helpLevelsUsed: v.array(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    if (!assignment.organizationId) {
      throw new Error("Assignment organization is missing. Run legacy backfill.");
    }
    const assignmentOrganizationId = assignment.organizationId;
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_assignment_student", (q) =>
        q
          .eq("organizationId", assignmentOrganizationId)
          .eq("assignmentId", args.assignmentId)
          .eq("studentId", args.studentId),
      )
      .collect();

    return attempts.map((attempt) => ({
      attemptId: attempt._id,
      totalHelpRequests: attempt.totalHelpRequests,
      helpLevelsUsed: attempt.helpLevelsUsed,
    }));
  },
});

export const calculateFinalIndependenceScore = internalMutation({
  args: {
    studentId: v.id("users"),
    assignmentId: v.id("assignments"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    if (!assignment.organizationId) {
      throw new Error("Assignment organization is missing. Run legacy backfill.");
    }
    const assignmentOrganizationId = assignment.organizationId;
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_assignment_student", (q) =>
        q
          .eq("organizationId", assignmentOrganizationId)
          .eq("assignmentId", args.assignmentId)
          .eq("studentId", args.studentId),
      )
      .collect();

    const result = computeFinalIndependenceScore({
      attempts,
      expectedMsPerQuestion: Math.max(
        30_000,
        Math.floor((assignment.timeLimitMinutes * 60_000) / Math.max(1, assignment.totalQuestions)),
      ),
    });
    if (result.gradedCount === 0) {
      await Promise.all(
        attempts.map((attempt) =>
          ctx.db.patch(attempt._id, {
            independenceScore: 0,
          }),
        ),
      );
      return 0;
    }
    const boundedFinalScore = result.finalScore;

    await Promise.all(
      attempts.map((attempt) =>
        ctx.db.patch(attempt._id, {
          independenceScore:
            attempt.submittedAt !== undefined && (attempt.studentAnswer ?? "").trim().length > 0
              ? boundedFinalScore
              : 0,
        }),
      ),
    );

    return boundedFinalScore;
  },
});
