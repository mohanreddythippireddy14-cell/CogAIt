import { action, mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.js";
import { requireAuthWithProfile, requireAuthFromAction } from "../lib/authGuards";
import { isFeatureEnabled } from "../infrastructure/featureFlags";
import { METRIC_CONTRACTS } from "../constants";

type AssignmentLite = {
  _id: Id<"assignments">;
  lecturerId: Id<"users">;
  title: string;
};

type AssignmentRollup = {
  assignmentId: Id<"assignments">;
  totalStudents: number;
  avgIndependenceScore: number;
  avgCognitiveScore: number;
  highRiskCount: number;
  computedAt: number;
  metricVersion: string;
  needsRecompute: boolean;
};

type TeacherOverviewResult = {
  totalStudents: number;
  totalAssignments: number;
  avgIndependenceScore: number;
  avgCognitiveScore: number;
  activeAlertsCount: number;
  highRiskStudents: number;
  stale: boolean;
  updatedAt: number;
  metricVersion: string;
};

function assertFaculty(role: string) {
  if (role !== "lecturer" && role !== "organizationAdmin") {
    throw new Error("Only faculty can access teacher dashboard.");
  }
}

export const getTeacherOverview = action({
  args: {},
  returns: v.object({
    totalStudents: v.number(),
    totalAssignments: v.number(),
    avgIndependenceScore: v.number(),
    avgCognitiveScore: v.number(),
    activeAlertsCount: v.number(),
    highRiskStudents: v.number(),
    stale: v.boolean(),
    updatedAt: v.number(),
    metricVersion: v.string(),
  }),
  handler: async (ctx): Promise<TeacherOverviewResult> => {
    const { userId, profile } = await requireAuthFromAction(ctx);
    assertFaculty(profile.role);
    if (!isFeatureEnabled("teacherDashboardApi", profile.organizationId)) {
      throw new Error("Teacher dashboard API feature is disabled.");
    }

    const assignments: AssignmentLite[] = profile.role === "organizationAdmin"
      ? await ctx.runQuery((internal as any)["dashboard/teacherOverview"]._getAssignmentsForOrg, {
          organizationId: profile.organizationId,
        })
      : await ctx.runQuery((internal as any)["dashboard/teacherOverview"]._getAssignmentsForLecturer, {
          organizationId: profile.organizationId,
          lecturerId: userId,
        });
    const rollups: AssignmentRollup[] = await ctx.runQuery((internal as any).dashboardRollups.getAssignmentRollupsForOrganization, {
      organizationId: profile.organizationId,
    });
    const assignmentIdSet = new Set(assignments.map((row: { _id: { toString(): string } }) => row._id.toString()));
    const relevantRollups: AssignmentRollup[] = rollups.filter((row: { assignmentId: { toString(): string } }) =>
      assignmentIdSet.has(row.assignmentId.toString())
    );

    const staleCutoff = Date.now() - METRIC_CONTRACTS.staleTtlMs;
    let stale = false;
    for (const assignment of assignments) {
      const rollup = relevantRollups.find((row: { assignmentId: unknown }) => row.assignmentId === assignment._id);
      const isStale = !rollup ||
        rollup.metricVersion !== METRIC_CONTRACTS.rollupMetricVersion ||
        rollup.computedAt < staleCutoff ||
        rollup.needsRecompute;
      if (isStale) {
        stale = true;
        await ctx.scheduler.runAfter(0, (internal as any).dashboardRollups.recomputeAssignmentRollups, {
          assignmentId: assignment._id,
        });
      }
    }

    const totalAssignments = assignments.length;
    const totalStudents: number = relevantRollups.reduce((sum: number, row: { totalStudents: number }) => sum + row.totalStudents, 0);
    const avgIndependenceScore = relevantRollups.length > 0
      ? Math.round(
          relevantRollups.reduce((sum: number, row: { avgIndependenceScore: number }) => sum + row.avgIndependenceScore, 0) /
            relevantRollups.length,
        )
      : 0;
    const avgCognitiveScore = relevantRollups.length > 0
      ? Math.round(
          relevantRollups.reduce((sum: number, row: { avgCognitiveScore: number }) => sum + row.avgCognitiveScore, 0) /
            relevantRollups.length,
        )
      : 0;
    const highRiskStudents = relevantRollups.reduce((sum: number, row: { highRiskCount: number }) => sum + row.highRiskCount, 0);
    const activeAlertsCount = await ctx.runQuery((internal as any)["dashboard/teacherOverview"]._countActiveAlerts, {
      organizationId: profile.organizationId,
    });
    const updatedAt = relevantRollups.reduce((max: number, row: { computedAt: number }) => Math.max(max, row.computedAt), 0);

    return {
      totalStudents,
      totalAssignments,
      avgIndependenceScore,
      avgCognitiveScore,
      activeAlertsCount,
      highRiskStudents,
      stale,
      updatedAt,
      metricVersion: METRIC_CONTRACTS.rollupMetricVersion,
    };
  },
});

export const triggerRollupRefresh = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    assertFaculty(profile.role);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.organizationId !== profile.organizationId) {
      throw new Error("Assignment not found.");
    }
    if (profile.role === "lecturer" && assignment.lecturerId !== userId) {
      throw new Error("Access denied.");
    }
    await ctx.scheduler.runAfter(0, (internal as any).dashboardRollups.recomputeAssignmentRollups, {
      assignmentId: args.assignmentId,
    });
    return true;
  },
});

export const _getAssignmentsForOrg = query({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.array(
    v.object({
      _id: v.id("assignments"),
      lecturerId: v.id("users"),
      title: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return rows.map((row) => ({ _id: row._id, lecturerId: row.lecturerId, title: row.title }));
  },
});

export const _getAssignmentsForLecturer = query({
  args: {
    organizationId: v.id("organizations"),
    lecturerId: v.id("users"),
  },
  returns: v.array(
    v.object({
      _id: v.id("assignments"),
      lecturerId: v.id("users"),
      title: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("assignments")
      .withIndex("by_org_and_lecturer", (q) =>
        q.eq("organizationId", args.organizationId).eq("lecturerId", args.lecturerId),
      )
      .collect();
    return rows.map((row) => ({ _id: row._id, lecturerId: row.lecturerId, title: row.title }));
  },
});

export const _countActiveAlerts = query({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const alerts = await ctx.db
      .query("dependencyAlerts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return alerts.filter((row) => !row.acknowledged).length;
  },
});
