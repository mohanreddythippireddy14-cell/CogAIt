import { query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireAuthWithProfile } from "./lib/authGuards";
import { isFeatureEnabled } from "./infrastructure/featureFlags";

type StudentAssignmentV1 = {
  _id: Id<"assignments">;
  _creationTime: number;
  lecturerId: Id<"users">;
  title: string;
  description?: string;
  timeLimitMinutes: number;
  totalQuestions: number;
  allowedLevels: number[];
  isActive: boolean;
  publishedAt?: number;
  aiProcessingStatus?: "processing" | "review_ready" | "completed" | "failed" | "failed_timeout";
  aiProcessingError?: string;
  aiJobId?: Id<"facultyAssignmentJobs">;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  avgScore: number;
};

export const getRoutingStatus = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    version: v.string(),
  }),
  handler: async (ctx) => {
    const { profile } = await requireAuthWithProfile(ctx);
    const enabled = isFeatureEnabled("apiV1Routing", profile.organizationId);
    return {
      enabled,
      version: enabled ? "v1" : "base",
    };
  },
});

export const getStudentAssignmentsV1 = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("assignments"),
      _creationTime: v.number(),
      lecturerId: v.id("users"),
      title: v.string(),
      description: v.optional(v.string()),
      timeLimitMinutes: v.number(),
      totalQuestions: v.number(),
      allowedLevels: v.array(v.number()),
      isActive: v.boolean(),
      publishedAt: v.optional(v.number()),
      aiProcessingStatus: v.optional(
        v.union(
          v.literal("processing"),
          v.literal("review_ready"),
          v.literal("completed"),
          v.literal("failed"),
          v.literal("failed_timeout"),
        ),
      ),
      aiProcessingError: v.optional(v.string()),
      aiJobId: v.optional(v.id("facultyAssignmentJobs")),
      status: v.union(v.literal("not_started"), v.literal("in_progress"), v.literal("completed")),
      progress: v.number(),
      avgScore: v.number(),
    }),
  ),
  handler: async (ctx): Promise<StudentAssignmentV1[]> => {
    const { profile } = await requireAuthWithProfile(ctx);
    if (!isFeatureEnabled("apiV1Routing", profile.organizationId)) {
      throw new Error("API v1 routing is disabled");
    }
    const result = await ctx.runQuery(api.assignments.getStudentAssignments, {});
    return result as StudentAssignmentV1[];
  },
});
