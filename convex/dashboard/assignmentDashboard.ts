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

type AssignmentRollup = {
  totalStudents: number;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  avgIndependenceScore: number;
  avgCognitiveScore: number;
  avgHelpRequests: number;
  avgOvertimeSeconds: number;
  metricVersion: string;
  computedAt: number;
  needsRecompute: boolean;
};

type StudentRollup = {
  studentId: Id<"users">;
  studentName: string;
  progressPercent: number;
  independenceScore: number;
  avgHelpRequests: number;
  overtimeSeconds: number;
  riskLevel: "high" | "medium" | "low";
  alertCount: number;
  lastActivityAt: number;
};

type TopicRollup = {
  topic: string;
  subject: "Physics" | "Chemistry" | "Math";
  accuracy: number;
  independence: number;
  dependencyLevel: "low" | "medium" | "high";
  status: "strong" | "moderate" | "weak";
};

type AssignmentDashboardResult = {
  assignmentId: Id<"assignments">;
  assignmentTitle: string;
  summary: {
    totalStudents: number;
    completedCount: number;
    inProgressCount: number;
    notStartedCount: number;
    avgIndependenceScore: number;
    avgCognitiveScore: number;
    avgHelpRequests: number;
    avgOvertimeSeconds: number;
  };
  topicHeatmap: TopicRollup[];
  studentList: {
    studentId: Id<"users">;
    name: string;
    progress: number;
    independenceScore: number;
    avgHelpRequests: number;
    overtimeSeconds: number;
    riskLevel: "high" | "medium" | "low";
    alerts: number;
    lastActive: number;
  }[];
  stale: boolean;
  updatedAt: number;
  metricVersion: string;
};

function assertFaculty(role: string) {
  if (role !== "lecturer" && role !== "organizationAdmin") {
    throw new Error("Only faculty can access assignment dashboard.");
  }
}

export const getAssignmentDashboard = action({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    assignmentId: v.id("assignments"),
    assignmentTitle: v.string(),
    summary: v.object({
      totalStudents: v.number(),
      completedCount: v.number(),
      inProgressCount: v.number(),
      notStartedCount: v.number(),
      avgIndependenceScore: v.number(),
      avgCognitiveScore: v.number(),
      avgHelpRequests: v.number(),
      avgOvertimeSeconds: v.number(),
    }),
    topicHeatmap: v.array(
      v.object({
        topic: v.string(),
        subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
        accuracy: v.number(),
        independence: v.number(),
        dependencyLevel: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
        status: v.union(v.literal("strong"), v.literal("moderate"), v.literal("weak")),
      }),
    ),
    studentList: v.array(
      v.object({
        studentId: v.id("users"),
        name: v.string(),
        progress: v.number(),
        independenceScore: v.number(),
        avgHelpRequests: v.number(),
        overtimeSeconds: v.number(),
        riskLevel: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
        alerts: v.number(),
        lastActive: v.number(),
      }),
    ),
    stale: v.boolean(),
    updatedAt: v.number(),
    metricVersion: v.string(),
  }),
  handler: async (ctx, args): Promise<AssignmentDashboardResult> => {
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

    const [assignmentRollup, studentRollups, topicRollups]: [AssignmentRollup | null, StudentRollup[], TopicRollup[]] = await Promise.all([
      ctx.runQuery((internal as any).dashboardRollups.getAssignmentRollup, {
        organizationId: profile.organizationId,
        assignmentId: args.assignmentId,
      }),
      ctx.runQuery((internal as any).dashboardRollups.getStudentRollupsByAssignment, {
        organizationId: profile.organizationId,
        assignmentId: args.assignmentId,
      }),
      ctx.runQuery((internal as any).dashboardRollups.getTopicRollupsByAssignment, {
        organizationId: profile.organizationId,
        assignmentId: args.assignmentId,
      }),
    ]);

    const staleCutoff = Date.now() - METRIC_CONTRACTS.staleTtlMs;
    const stale = !assignmentRollup ||
      assignmentRollup.metricVersion !== METRIC_CONTRACTS.rollupMetricVersion ||
      assignmentRollup.computedAt < staleCutoff ||
      assignmentRollup.needsRecompute;
    if (stale) {
      await ctx.scheduler.runAfter(0, (internal as any).dashboardRollups.recomputeAssignmentRollups, {
        assignmentId: args.assignmentId,
      });
    }

    return {
      assignmentId: assignment._id,
      assignmentTitle: assignment.title,
      summary: assignmentRollup
        ? {
            totalStudents: assignmentRollup.totalStudents,
            completedCount: assignmentRollup.completedCount,
            inProgressCount: assignmentRollup.inProgressCount,
            notStartedCount: assignmentRollup.notStartedCount,
            avgIndependenceScore: assignmentRollup.avgIndependenceScore,
            avgCognitiveScore: assignmentRollup.avgCognitiveScore,
            avgHelpRequests: assignmentRollup.avgHelpRequests,
            avgOvertimeSeconds: assignmentRollup.avgOvertimeSeconds,
          }
        : {
            totalStudents: 0,
            completedCount: 0,
            inProgressCount: 0,
            notStartedCount: 0,
            avgIndependenceScore: 0,
            avgCognitiveScore: 0,
            avgHelpRequests: 0,
            avgOvertimeSeconds: 0,
          },
      topicHeatmap: topicRollups.map((row: TopicRollup) => ({
        topic: row.topic,
        subject: row.subject,
        accuracy: row.accuracy,
        independence: row.independence,
        dependencyLevel: row.dependencyLevel,
        status: row.status,
      })),
      studentList: studentRollups
        .slice()
        .sort(
          (a: { independenceScore: number }, b: { independenceScore: number }) =>
            b.independenceScore - a.independenceScore,
        )
        .map((row: StudentRollup) => ({
          studentId: row.studentId,
          name: row.studentName,
          progress: row.progressPercent,
          independenceScore: row.independenceScore,
          avgHelpRequests: row.avgHelpRequests,
          overtimeSeconds: row.overtimeSeconds,
          riskLevel: row.riskLevel,
          alerts: row.alertCount,
          lastActive: row.lastActivityAt,
        })),
      stale,
      updatedAt: assignmentRollup?.computedAt ?? 0,
      metricVersion: METRIC_CONTRACTS.rollupMetricVersion,
    };
  },
});

export const _getAssignment = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.union(
    v.object({
      _id: v.id("assignments"),
      organizationId: v.id("organizations"),
      lecturerId: v.id("users"),
      title: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      return null;
    }
    return {
      _id: assignment._id,
      organizationId: assignment.organizationId,
      lecturerId: assignment.lecturerId,
      title: assignment.title,
    };
  },
});
