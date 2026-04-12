import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "../lib/authGuards";

function assertFaculty(role: string) {
  if (role !== "lecturer" && role !== "organizationAdmin") {
    throw new Error("Only faculty can access recommendations.");
  }
}

export const getFacultyRecommendations = query({
  args: {},
  returns: v.array(
    v.object({
      recommendationId: v.string(),
      type: v.union(v.literal("topic_insight"), v.literal("intervention"), v.literal("grouping"), v.literal("strategy")),
      title: v.string(),
      description: v.string(),
      priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      assignmentId: v.optional(v.id("assignments")),
      affectedStudents: v.number(),
      autoActionType: v.optional(v.union(v.literal("generate_material"), v.literal("grouping_preview"))),
      state: v.object({
        dismissed: v.boolean(),
        actedUpon: v.boolean(),
        timestamp: v.optional(v.number()),
      }),
    }),
  ),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    assertFaculty(profile.role);

    const assignments = profile.role === "organizationAdmin"
      ? await ctx.db
          .query("assignments")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
          .collect()
      : await ctx.db
          .query("assignments")
          .withIndex("by_org_and_lecturer", (q) =>
            q.eq("organizationId", profile.organizationId).eq("lecturerId", userId),
          )
          .collect();
    const assignmentIdSet = new Set(assignments.map((row) => row._id.toString()));
    const rollups = await ctx.db
      .query("assignmentAnalyticsRollups")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const relevantRollups = rollups.filter((row) => assignmentIdSet.has(row.assignmentId.toString()));
    const topicRollups = await ctx.db
      .query("topicAnalyticsRollups")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();

    const recommendations: Array<{
      recommendationId: string;
      type: "topic_insight" | "intervention" | "grouping" | "strategy";
      title: string;
      description: string;
      priority: "high" | "medium" | "low";
      assignmentId?: typeof assignments[number]["_id"];
      affectedStudents: number;
      autoActionType?: "generate_material" | "grouping_preview";
    }> = [];

    for (const row of relevantRollups) {
      if (row.highRiskCount >= 3) {
        recommendations.push({
          recommendationId: `risk-${row.assignmentId.toString()}`,
          type: "intervention",
          title: "High dependency cluster detected",
          description: `${row.highRiskCount} students are in high-risk band.`,
          priority: "high",
          assignmentId: row.assignmentId,
          affectedStudents: row.highRiskCount,
          autoActionType: "grouping_preview",
        });
      }
      if (row.avgIndependenceScore < 50) {
        recommendations.push({
          recommendationId: `strategy-${row.assignmentId.toString()}`,
          type: "strategy",
          title: "Independence below threshold",
          description: "Class independence is below 50%. Use stricter cognitive prompts next cycle.",
          priority: "high",
          assignmentId: row.assignmentId,
          affectedStudents: row.totalStudents,
        });
      }
    }

    for (const topic of topicRollups.filter((row) => assignmentIdSet.has(row.assignmentId.toString()))) {
      if (topic.dependencyLevel === "high") {
        recommendations.push({
          recommendationId: `topic-${topic.assignmentId.toString()}-${topic.topic}`,
          type: "topic_insight",
          title: `${topic.topic}: high dependency`,
          description: `Generate targeted revision for ${topic.topic}.`,
          priority: "medium",
          assignmentId: topic.assignmentId,
          affectedStudents: topic.totalAttempts,
          autoActionType: "generate_material",
        });
      }
    }

    const stateRows = await ctx.db
      .query("recommendationState")
      .withIndex("by_org_and_lecturer", (q) =>
        q.eq("organizationId", profile.organizationId).eq("lecturerId", userId),
      )
      .collect();
    const stateById = new Map(stateRows.map((row) => [row.recommendationId, row]));

    return recommendations.map((row) => {
      const state = stateById.get(row.recommendationId);
      return {
        ...row,
        state: {
          dismissed: state?.dismissed ?? false,
          actedUpon: state?.actedUpon ?? false,
          timestamp: state?.timestamp,
        },
      };
    });
  },
});

export const setRecommendationState = mutation({
  args: {
    recommendationId: v.string(),
    dismissed: v.optional(v.boolean()),
    actedUpon: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    assertFaculty(profile.role);
    const existing = await ctx.db
      .query("recommendationState")
      .withIndex("by_org_lecturer_recommendation", (q) =>
        q
          .eq("organizationId", profile.organizationId)
          .eq("lecturerId", userId)
          .eq("recommendationId", args.recommendationId),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        dismissed: args.dismissed ?? existing.dismissed,
        actedUpon: args.actedUpon ?? existing.actedUpon,
        timestamp: Date.now(),
      });
      return true;
    }
    await ctx.db.insert("recommendationState", {
      organizationId: profile.organizationId,
      lecturerId: userId,
      recommendationId: args.recommendationId,
      dismissed: args.dismissed ?? false,
      actedUpon: args.actedUpon ?? false,
      timestamp: Date.now(),
    });
    return true;
  },
});

export const executeSafeAutoAction = mutation({
  args: {
    recommendationId: v.string(),
    actionType: v.union(v.literal("generate_material"), v.literal("grouping_preview")),
    confirmedByFaculty: v.boolean(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const { profile } = await requireAuthWithProfile(ctx);
    assertFaculty(profile.role);
    if (!args.confirmedByFaculty) {
      return {
        success: false,
        message: "Confirmation required before executing auto action.",
      };
    }
    if (args.actionType !== "generate_material" && args.actionType !== "grouping_preview") {
      return {
        success: false,
        message: "Unsafe auto action blocked.",
      };
    }
    return {
      success: true,
      message: args.actionType === "generate_material"
        ? "Material generation queued."
        : "Grouping preview generated.",
    };
  },
});
