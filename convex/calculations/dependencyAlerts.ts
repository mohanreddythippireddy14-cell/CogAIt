import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { INDEPENDENCE_THRESHOLDS } from "../constants";
import { Doc, Id } from "../_generated/dataModel";
import { requireAuthWithProfile } from "../lib/authGuards";
import { requireSameOrganization } from "../infrastructure/organizationGuard";
import { recommendedActionForRisk, riskFromIndependence } from "../domain/scoring";

export const generateDependencyAlerts = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      studentId: v.id("users"),
      independenceScore: v.number(),
      riskLevel: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      weakTopics: v.array(v.string()),
      recommendedAction: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();

    const questionIds = [...new Set(attempts.map((attempt) => attempt.questionId))];
    const questions = await Promise.all(questionIds.map((questionId) => ctx.db.get(questionId)));
    const questionById = new Map(
      questions
        .filter((question): question is Doc<"questions"> => question !== null)
        .map((question) => [question._id, question]),
    );

    const attemptsByStudent = new Map<
      string,
      { studentId: Id<"users">; attempts: Array<(typeof attempts)[number]> }
    >();
    for (const attempt of attempts) {
      const key = attempt.studentId.toString();
      const existing = attemptsByStudent.get(key);
      if (existing) {
        existing.attempts.push(attempt);
      } else {
        attemptsByStudent.set(key, { studentId: attempt.studentId, attempts: [attempt] });
      }
    }

    const alerts = Array.from(attemptsByStudent.values()).map(({ studentId, attempts: studentAttempts }) => {
      const avgIndependence =
        studentAttempts.length === 0
          ? 0
          : studentAttempts.reduce((sum, attempt) => sum + (attempt.independenceScore ?? 0), 0) /
            studentAttempts.length;

      const weakTopics = [...new Set(
        studentAttempts
          .filter((attempt) => (attempt.independenceScore ?? 0) < INDEPENDENCE_THRESHOLDS.mediumRisk)
          .map((attempt) => questionById.get(attempt.questionId)?.topic)
          .filter((topic): topic is string => topic !== undefined),
      )];

      const independenceScore = Math.round(avgIndependence);
      const riskLevel = riskFromIndependence(independenceScore);

      return {
        studentId,
        independenceScore,
        riskLevel,
        weakTopics,
        recommendedAction: recommendedActionForRisk(riskLevel),
      };
    });

    return alerts;
  },
});

export const checkAndCreateAlerts = mutation({
  args: {
    studentId: v.id("users"),
    assignmentId: v.id("assignments"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireAuthWithProfile(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_assignment_student", (q) =>
        q
          .eq("organizationId", profile.organizationId)
          .eq("assignmentId", args.assignmentId)
          .eq("studentId", args.studentId),
      )
      .collect();

    if (attempts.length < 3) {
      return null;
    }

    const totalHelp = attempts.reduce((sum, a) => sum + a.totalHelpRequests, 0);
    const avgHelp = totalHelp / attempts.length;
    const independentCount = attempts.filter((a) => a.totalHelpRequests === 0).length;
    const independenceRate = independentCount / attempts.length;

    if (avgHelp > 3) {
      await ctx.db.insert("dependencyAlerts", {
        organizationId: profile.organizationId,
        studentId: args.studentId,
        assignmentId: args.assignmentId,
        alertType: "high_help_frequency",
        severity: "high",
        message: `Student averaging ${avgHelp.toFixed(1)} help requests per question`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }

    if (independenceRate < 0.2) {
      await ctx.db.insert("dependencyAlerts", {
        organizationId: profile.organizationId,
        studentId: args.studentId,
        assignmentId: args.assignmentId,
        alertType: "low_independence",
        severity: "high",
        message: `Only ${(independenceRate * 100).toFixed(0)}% of attempts solved independently`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }

    const recentAttempts = attempts.slice(-5);
    const olderAttempts = attempts.slice(0, -5);
    if (olderAttempts.length > 0 && recentAttempts.length > 0) {
      const recentAvg =
        recentAttempts.reduce((sum, a) => sum + a.totalHelpRequests, 0) / recentAttempts.length;
      const olderAvg =
        olderAttempts.reduce((sum, a) => sum + a.totalHelpRequests, 0) / olderAttempts.length;

      if (recentAvg > olderAvg * 1.5) {
        await ctx.db.insert("dependencyAlerts", {
          organizationId: profile.organizationId,
          studentId: args.studentId,
          assignmentId: args.assignmentId,
          alertType: "increasing_dependency",
          severity: "medium",
          message: "Help request frequency increasing over time",
          timestamp: Date.now(),
          acknowledged: false,
        });
      }
    }

    const level4Usage = attempts.reduce(
      (sum, a) => sum + a.helpLevelsUsed.filter((lvl) => lvl === 4).length,
      0,
    );
    if (level4Usage >= 5) {
      await ctx.db.insert("dependencyAlerts", {
        organizationId: profile.organizationId,
        studentId: args.studentId,
        assignmentId: args.assignmentId,
        alertType: "level_4_overuse",
        severity: "medium",
        message: `Level 4 help used ${level4Usage} times`,
        timestamp: Date.now(),
        acknowledged: false,
      });
    }

    return null;
  },
});
