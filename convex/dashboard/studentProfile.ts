import { action, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.js";
import { requireAuthWithProfile } from "../lib/authGuards";
import { METRIC_CONTRACTS } from "../constants";

type AssignmentLookup = {
  _id: Id<"assignments">;
  organizationId: Id<"organizations">;
  lecturerId: Id<"users">;
  title: string;
};

type StudentRollup = {
  studentName: string;
  studentEmail?: string;
  independenceScore: number;
  cognitiveScore: number;
  avgHelpRequests: number;
  progressPercent: number;
  overtimeSeconds: number;
  riskLevel: "high" | "medium" | "low";
  alertCount: number;
  computedAt: number;
  metricVersion: string;
  needsRecompute: boolean;
};

type StudentTimelinePoint = {
  computedAt: number;
  independenceScore: number;
  cognitiveScore: number;
};

type TopicRollup = {
  topic: string;
  subject: "Physics" | "Chemistry" | "Math";
  accuracy: number;
  independence: number;
  status: "strong" | "moderate" | "weak";
};

type StudentCognitiveProfileResult = {
  student: {
    studentId: Id<"users">;
    name: string;
    email?: string;
  };
  cognitiveMetrics: {
    independenceScore: number;
    cognitiveScore: number;
    avgHelpRequests: number;
    progressPercent: number;
    overtimeSeconds: number;
    riskLevel: "high" | "medium" | "low";
    alertCount: number;
  };
  growthCurve: StudentTimelinePoint[];
  topicMastery: TopicRollup[];
  stale: boolean;
  updatedAt: number;
  metricVersion: string;
};

function assertFaculty(role: string) {
  if (role !== "lecturer" && role !== "organizationAdmin") {
    throw new Error("Only faculty can access student profile.");
  }
}

export const getStudentCognitiveProfile = action({
  args: {
    assignmentId: v.id("assignments"),
    studentId: v.id("users"),
  },
  returns: v.object({
    student: v.object({
      studentId: v.id("users"),
      name: v.string(),
      email: v.optional(v.string()),
    }),
    cognitiveMetrics: v.object({
      independenceScore: v.number(),
      cognitiveScore: v.number(),
      avgHelpRequests: v.number(),
      progressPercent: v.number(),
      overtimeSeconds: v.number(),
      riskLevel: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      alertCount: v.number(),
    }),
    growthCurve: v.array(
      v.object({
        computedAt: v.number(),
        independenceScore: v.number(),
        cognitiveScore: v.number(),
      }),
    ),
    topicMastery: v.array(
      v.object({
        topic: v.string(),
        subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
        accuracy: v.number(),
        independence: v.number(),
        status: v.union(v.literal("strong"), v.literal("moderate"), v.literal("weak")),
      }),
    ),
    stale: v.boolean(),
    updatedAt: v.number(),
    metricVersion: v.string(),
  }),
  handler: async (ctx, args): Promise<StudentCognitiveProfileResult> => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    assertFaculty(profile.role);
    const assignment: AssignmentLookup | null = await ctx.runQuery((internal as any)["dashboard/assignmentDashboard"]._getAssignment, {
      assignmentId: args.assignmentId,
    });
    if (!assignment || assignment.organizationId !== profile.organizationId) {
      throw new Error("Assignment not found.");
    }
    if (profile.role === "lecturer" && assignment.lecturerId !== userId) {
      throw new Error("Access denied.");
    }

    const [rollup, timeline, topicRollups]: [StudentRollup | null, StudentTimelinePoint[], TopicRollup[]] = await Promise.all([
      ctx.runQuery((internal as any).dashboardRollups.getStudentRollupByAssignmentStudent, {
        organizationId: profile.organizationId,
        assignmentId: args.assignmentId,
        studentId: args.studentId,
      }),
      ctx.runQuery((internal as any)["dashboard/studentProfile"]._getStudentRollupTimeline, {
        organizationId: profile.organizationId,
        studentId: args.studentId,
      }),
      ctx.runQuery((internal as any).dashboardRollups.getTopicRollupsByAssignment, {
        organizationId: profile.organizationId,
        assignmentId: args.assignmentId,
      }),
    ]);

    const staleCutoff = Date.now() - METRIC_CONTRACTS.staleTtlMs;
    const stale = !rollup ||
      rollup.metricVersion !== METRIC_CONTRACTS.rollupMetricVersion ||
      rollup.computedAt < staleCutoff ||
      rollup.needsRecompute;
    if (stale) {
      await ctx.scheduler.runAfter(0, (internal as any).dashboardRollups.recomputeAssignmentRollups, {
        assignmentId: args.assignmentId,
      });
    }

    return {
      student: {
        studentId: args.studentId,
        name: rollup?.studentName ?? "Student",
        email: rollup?.studentEmail,
      },
      cognitiveMetrics: {
        independenceScore: rollup?.independenceScore ?? 0,
        cognitiveScore: rollup?.cognitiveScore ?? 0,
        avgHelpRequests: rollup?.avgHelpRequests ?? 0,
        progressPercent: rollup?.progressPercent ?? 0,
        overtimeSeconds: rollup?.overtimeSeconds ?? 0,
        riskLevel: rollup?.riskLevel ?? "low",
        alertCount: rollup?.alertCount ?? 0,
      },
      growthCurve: timeline
        .slice()
        .sort((a: { computedAt: number }, b: { computedAt: number }) => a.computedAt - b.computedAt)
        .map((row: { computedAt: number; independenceScore: number; cognitiveScore: number }) => ({
          computedAt: row.computedAt,
          independenceScore: row.independenceScore,
          cognitiveScore: row.cognitiveScore,
        })),
      topicMastery: topicRollups.map((row: TopicRollup) => ({
        topic: row.topic,
        subject: row.subject,
        accuracy: row.accuracy,
        independence: row.independence,
        status: row.status,
      })),
      stale,
      updatedAt: rollup?.computedAt ?? 0,
      metricVersion: METRIC_CONTRACTS.rollupMetricVersion,
    };
  },
});

export const _getStudentRollupTimeline = query({
  args: {
    organizationId: v.id("organizations"),
    studentId: v.id("users"),
  },
  returns: v.array(
    v.object({
      computedAt: v.number(),
      independenceScore: v.number(),
      cognitiveScore: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("studentAnalyticsRollups")
      .withIndex("by_org_student", (q) =>
        q.eq("organizationId", args.organizationId).eq("studentId", args.studentId),
      )
      .collect();
    return rows.map((row) => ({
      computedAt: row.computedAt,
      independenceScore: row.independenceScore,
      cognitiveScore: row.cognitiveScore,
    }));
  },
});
