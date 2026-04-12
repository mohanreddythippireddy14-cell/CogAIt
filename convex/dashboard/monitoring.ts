import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "../lib/authGuards";
import { METRIC_CONTRACTS } from "../constants";

function assertInternalAdmin(profile: { role: string; isInternalAdmin?: boolean }) {
  if (!profile.isInternalAdmin) {
    throw new Error("Only internal admin can access monitoring.");
  }
}

export const getRollupMonitoring = query({
  args: {},
  returns: v.object({
    p95TargetsMs: v.object({
      teacherOverview: v.number(),
      assignmentDashboard: v.number(),
      studentProfile: v.number(),
    }),
    staleRollupCount: v.number(),
    jobFailures24h: v.number(),
    driftPercentage24h: v.number(),
  }),
  handler: async (ctx) => {
    const { profile } = await requireAuthWithProfile(ctx);
    assertInternalAdmin({ role: profile.role, isInternalAdmin: (profile as any).isInternalAdmin });

    const staleCutoff = Date.now() - METRIC_CONTRACTS.staleTtlMs;
    const rollups = await ctx.db
      .query("assignmentAnalyticsRollups")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const staleRollupCount = rollups.filter(
      (row) =>
        row.needsRecompute ||
        row.computedAt < staleCutoff ||
        row.metricVersion !== METRIC_CONTRACTS.rollupMetricVersion,
    ).length;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_event", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const since24h = Date.now() - 24 * 60 * 60 * 1000;
    const recent = logs.filter((log) => log.createdAt >= since24h);
    const jobFailures24h = recent.filter((log) =>
      log.eventType === "rollup_job_hourly_failure" || log.eventType === "rollup_job_nightly_failure"
    ).length;

    const driftLogs = recent.filter((log) => log.eventType === "rollup_drift_detection");
    let driftSum = 0;
    let driftCount = 0;
    for (const log of driftLogs) {
      try {
        const parsed = JSON.parse(log.metadata ?? "{}") as { driftPercent?: number };
        if (typeof parsed.driftPercent === "number") {
          driftSum += parsed.driftPercent;
          driftCount += 1;
        }
      } catch {
        // ignore malformed metadata
      }
    }

    return {
      p95TargetsMs: {
        teacherOverview: 250,
        assignmentDashboard: 300,
        studentProfile: 300,
      },
      staleRollupCount,
      jobFailures24h,
      driftPercentage24h: driftCount > 0 ? Number(((driftSum / driftCount) * 100).toFixed(2)) : 0,
    };
  },
});
