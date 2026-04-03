import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "../lib/authGuards";
import { requireSameOrganization } from "../infrastructure/organizationGuard";

export const getTopicAnalytics = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      topic: v.string(),
      totalAttempts: v.number(),
      avgIndependence: v.number(),
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

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();

    const questionTopicById = new Map(questions.map((question) => [question._id, question.topic]));
    const aggregates = new Map<string, { totalAttempts: number; totalIndependence: number }>();

    for (const attempt of attempts) {
      const topic = questionTopicById.get(attempt.questionId);
      if (!topic) {
        continue;
      }
      const existing = aggregates.get(topic) ?? { totalAttempts: 0, totalIndependence: 0 };
      existing.totalAttempts += 1;
      existing.totalIndependence += attempt.independenceScore ?? 0;
      aggregates.set(topic, existing);
    }

    return Array.from(aggregates.entries()).map(([topic, aggregate]) => ({
      topic,
      totalAttempts: aggregate.totalAttempts,
      avgIndependence:
        aggregate.totalAttempts === 0
          ? 0
          : Math.round(aggregate.totalIndependence / aggregate.totalAttempts),
    }));
  },
});

export const getTopicPerformance = query({
  args: {
    assignmentId: v.optional(v.id("assignments")),
  },
  returns: v.array(
    v.object({
      topic: v.string(),
      subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
      totalQuestions: v.number(),
      totalAttempts: v.number(),
      correctAttempts: v.number(),
      avgHelpRequests: v.number(),
      avgTimeSpentMinutes: v.number(),
      successRate: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    let assignmentIds: Array<typeof args.assignmentId> = [];
    if (args.assignmentId) {
      const assignment = await ctx.db.get(args.assignmentId);
      if (!assignment || assignment.lecturerId !== userId) {
        throw new Error("Assignment not found or access denied");
      }
      requireSameOrganization(assignment.organizationId, profile.organizationId);
      assignmentIds = [args.assignmentId];
    } else {
      const assignments = await ctx.db
        .query("assignments")
        .withIndex("by_org_and_lecturer", (q) =>
          q.eq("organizationId", profile.organizationId).eq("lecturerId", userId),
        )
        .collect();
      assignmentIds = assignments.map((a) => a._id);
    }

    const topicStats = new Map<
      string,
      {
        topic: string;
        subject: "Physics" | "Chemistry" | "Math";
        totalQuestions: number;
        totalAttempts: number;
        correctAttempts: number;
        totalHelpRequests: number;
        totalTimeMs: number;
      }
    >();

    for (const assignmentId of assignmentIds) {
      if (!assignmentId) {
        continue;
      }
      const questions = await ctx.db
        .query("questions")
        .withIndex("by_assignment", (q) => q.eq("assignmentId", assignmentId))
        .collect();
      const attempts = await ctx.db
        .query("attempts")
        .withIndex("by_org_and_assignment", (q) =>
          q.eq("organizationId", profile.organizationId).eq("assignmentId", assignmentId),
        )
        .collect();

      for (const question of questions) {
        const key = `${question.subject}:${question.topic}`;
        const existing = topicStats.get(key) ?? {
          topic: question.topic,
          subject: question.subject,
          totalQuestions: 0,
          totalAttempts: 0,
          correctAttempts: 0,
          totalHelpRequests: 0,
          totalTimeMs: 0,
        };
        existing.totalQuestions += 1;

        const questionAttempts = attempts.filter((a) => a.questionId === question._id);
        existing.totalAttempts += questionAttempts.length;
        existing.correctAttempts += questionAttempts.filter((a) => a.isCorrect).length;
        existing.totalHelpRequests += questionAttempts.reduce((sum, a) => sum + a.totalHelpRequests, 0);
        existing.totalTimeMs += questionAttempts.reduce(
          (sum, a) =>
            sum +
            (a.submittedAt && a.startedAt && a.submittedAt > a.startedAt
              ? a.submittedAt - a.startedAt
              : 0),
          0,
        );

        topicStats.set(key, existing);
      }
    }

    return Array.from(topicStats.values())
      .map((stats) => ({
        topic: stats.topic,
        subject: stats.subject,
        totalQuestions: stats.totalQuestions,
        totalAttempts: stats.totalAttempts,
        correctAttempts: stats.correctAttempts,
        avgHelpRequests:
          stats.totalAttempts > 0 ? stats.totalHelpRequests / stats.totalAttempts : 0,
        avgTimeSpentMinutes:
          stats.totalAttempts > 0 ? Math.round(stats.totalTimeMs / stats.totalAttempts / 60000) : 0,
        successRate: stats.totalAttempts > 0 ? (stats.correctAttempts / stats.totalAttempts) * 100 : 0,
      }))
      .sort((a, b) => a.successRate - b.successRate);
  },
});
