import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel.js";
import { METRIC_CONTRACTS } from "../constants";

type RollupSample = {
  organizationId: Id<"organizations">;
  assignmentId: Id<"assignments">;
  totalStudents: number;
};

type DriftResult = {
  sampled: number;
  mismatched: number;
};

type OrgMismatchAggregate = {
  org: Id<"organizations">;
  sampled: number;
  mismatched: number;
};

export const _getOrganizations = internalQuery({
  args: {},
  returns: v.array(v.id("organizations")),
  handler: async (ctx) => {
    const rows = await ctx.db.query("organizations").collect();
    return rows.map((row) => row._id);
  },
});

export const _getOrganizationAssignments = internalQuery({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.array(v.id("assignments")),
  handler: async (ctx, args) => {
    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return assignments.map((row) => row._id);
  },
});

export const _getStaleRollupsForOrg = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    staleBefore: v.number(),
  },
  returns: v.array(v.id("assignments")),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("assignmentAnalyticsRollups")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return rows
      .filter((row) => row.computedAt < args.staleBefore || row.needsRecompute)
      .map((row) => row.assignmentId);
  },
});

export const _getRecentAssignmentRollupSamples = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      organizationId: v.id("organizations"),
      assignmentId: v.id("assignments"),
      totalStudents: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("assignmentAnalyticsRollups")
      .order("desc")
      .take(20);
    return rows.map((row) => ({
      organizationId: row.organizationId,
      assignmentId: row.assignmentId,
      totalStudents: row.totalStudents,
    }));
  },
});

export const _getRawAssignmentCounts = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    totalStudents: v.number(),
  }),
  handler: async (ctx, args) => {
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", args.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const progressRows = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", args.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const studentIds = new Set<string>([
      ...attempts.map((row) => row.studentId.toString()),
      ...progressRows.map((row) => row.studentId.toString()),
    ]);
    return { totalStudents: studentIds.size };
  },
});

export const _logJobEvent = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    eventType: v.string(),
    metadata: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const systemUser = await ctx.db.query("users").first();
    if (!systemUser) {
      return null;
    }
    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      actorId: systemUser._id,
      eventType: args.eventType,
      resourceType: "dashboard_rollups",
      resourceId: undefined,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const reconcileRecentRollups = internalAction({
  args: {},
  returns: v.object({
    processedAssignments: v.number(),
  }),
  handler: async (ctx) => {
    const organizations = await ctx.runQuery((internal as any)["dashboard/jobs"]._getOrganizations, {});
    let processedAssignments = 0;
    const now = Date.now();
    const start = now - 24 * 60 * 60 * 1000;

    for (const organizationId of organizations) {
      try {
        const assignments = await ctx.runQuery((internal as any)["dashboard/jobs"]._getOrganizationAssignments, {
          organizationId,
        });
        for (const assignmentId of assignments) {
          await ctx.runMutation((internal as any).dashboardRollups.recomputeAssignmentRollups, {
            assignmentId,
            sourceWindowStart: start,
            sourceWindowEnd: now,
          });
          processedAssignments += 1;
        }
        await ctx.runMutation((internal as any)["dashboard/jobs"]._logJobEvent, {
          organizationId,
          eventType: "rollup_job_hourly_success",
          metadata: JSON.stringify({ processedAssignments, windowStart: start, windowEnd: now }),
        });
      } catch (error) {
        await ctx.runMutation((internal as any)["dashboard/jobs"]._logJobEvent, {
          organizationId,
          eventType: "rollup_job_hourly_failure",
          metadata: JSON.stringify({ error: String(error), windowStart: start, windowEnd: now }),
        });
      }
    }

    return { processedAssignments };
  },
});

export const nightlyRollupSnapshot = internalAction({
  args: {},
  returns: v.object({
    processedAssignments: v.number(),
    markedStale: v.number(),
  }),
  handler: async (ctx) => {
    const organizations = await ctx.runQuery((internal as any)["dashboard/jobs"]._getOrganizations, {});
    let processedAssignments = 0;
    let markedStale = 0;
    const now = Date.now();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const sourceWindowStart = dayStart.getTime();

    for (const organizationId of organizations) {
      try {
        const assignments = await ctx.runQuery((internal as any)["dashboard/jobs"]._getOrganizationAssignments, {
          organizationId,
        });
        for (const assignmentId of assignments) {
          await ctx.runMutation((internal as any).dashboardRollups.recomputeAssignmentRollups, {
            assignmentId,
            sourceWindowStart,
            sourceWindowEnd: now,
          });
          processedAssignments += 1;
        }

        const staleCandidates = await ctx.runQuery((internal as any)["dashboard/jobs"]._getStaleRollupsForOrg, {
          organizationId,
          staleBefore: now - METRIC_CONTRACTS.staleTtlMs,
        });
        for (const assignmentId of staleCandidates) {
          await ctx.runMutation((internal as any).dashboardRollups.markRollupsNeedsRecompute, {
            assignmentId,
            value: true,
          });
          markedStale += 1;
        }
        await ctx.runMutation((internal as any)["dashboard/jobs"]._logJobEvent, {
          organizationId,
          eventType: "rollup_job_nightly_success",
          metadata: JSON.stringify({ processedAssignments, markedStale, sourceWindowStart, sourceWindowEnd: now }),
        });
      } catch (error) {
        await ctx.runMutation((internal as any)["dashboard/jobs"]._logJobEvent, {
          organizationId,
          eventType: "rollup_job_nightly_failure",
          metadata: JSON.stringify({ error: String(error), sourceWindowStart, sourceWindowEnd: now }),
        });
      }
    }

    return { processedAssignments, markedStale };
  },
});

export const detectRollupDrift = internalAction({
  args: {},
  returns: v.object({
    sampled: v.number(),
    mismatched: v.number(),
  }),
  handler: async (ctx): Promise<DriftResult> => {
    const samples: RollupSample[] = await ctx.runQuery((internal as any)["dashboard/jobs"]._getRecentAssignmentRollupSamples, {});
    let mismatched = 0;

    const mismatchByOrganization = new Map<string, OrgMismatchAggregate>();
    for (const sample of samples) {
      const baseline = await ctx.runQuery((internal as any)["dashboard/jobs"]._getRawAssignmentCounts, {
        organizationId: sample.organizationId,
        assignmentId: sample.assignmentId,
      });
      const orgKey = sample.organizationId.toString();
      const agg = mismatchByOrganization.get(orgKey) ?? { org: sample.organizationId, sampled: 0, mismatched: 0 };
      agg.sampled += 1;
      const denom = Math.max(1, baseline.totalStudents);
      const mismatch = Math.abs(baseline.totalStudents - sample.totalStudents) / denom;
      if (mismatch > METRIC_CONTRACTS.driftMismatchThreshold) {
        await ctx.runMutation((internal as any).dashboardRollups.markRollupsNeedsRecompute, {
          assignmentId: sample.assignmentId,
          value: true,
        });
        mismatched += 1;
        agg.mismatched += 1;
      }
      mismatchByOrganization.set(orgKey, agg);
    }

    for (const item of mismatchByOrganization.values()) {
      await ctx.runMutation((internal as any)["dashboard/jobs"]._logJobEvent, {
        organizationId: item.org,
        eventType: "rollup_drift_detection",
        metadata: JSON.stringify({
          sampled: item.sampled,
          mismatched: item.mismatched,
          driftPercent: item.sampled > 0 ? item.mismatched / item.sampled : 0,
        }),
      });
    }

    return {
      sampled: samples.length,
      mismatched,
    };
  },
});
