import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireAuth, requireAuthWithProfile } from "./lib/authGuards";
import {
  clearOrganizationFeatureFlag,
  FeatureFlag,
  getFeatureFlagSnapshot,
  isFeatureEnabled,
  setOrganizationFeatureFlag,
} from "./infrastructure/featureFlags";
import { logEvent } from "./infrastructure/logger";
import { buildIntegritySummary } from "./application/integrityMetricsService";
import { writeAuditLog } from "./infrastructure/auditTrail";

const featureFlagValidator = v.union(
  v.literal("structuredLogging"),
  v.literal("aiUsageMetrics"),
  v.literal("integrityDashboard"),
  v.literal("optimizedQueries"),
  v.literal("cachingLayer"),
  v.literal("aiQueueAbstraction"),
  v.literal("auditTrail"),
  v.literal("orgRateLimit"),
  v.literal("serverSideIntegrity"),
  v.literal("strictJsonValidation"),
  v.literal("promptVersioning"),
  v.literal("aiRegressionEnforcement"),
  v.literal("apiV1Routing"),
  v.literal("adminDashboard"),
  v.literal("multiInstitutionAnalytics"),
  v.literal("costGovernance"),
);

function requireOrganizationAdmin(role: "student" | "lecturer" | "organizationAdmin") {
  if (role !== "organizationAdmin") {
    throw new Error("Only organization admins can perform this action");
  }
}

type LegacyBackfillResult = {
  organizationId: Id<"organizations">;
  patchedUsers: number;
  patchedAssignments: number;
  patchedJobs: number;
  patchedAttempts: number;
  patchedAlerts: number;
  patchedAiInteractions: number;
  patchedSessionLocks: number;
};

export const getFeatureFlags = query({
  args: {},
  returns: v.object({
    flags: v.object({
      structuredLogging: v.boolean(),
      aiUsageMetrics: v.boolean(),
      integrityDashboard: v.boolean(),
      optimizedQueries: v.boolean(),
      cachingLayer: v.boolean(),
      aiQueueAbstraction: v.boolean(),
      auditTrail: v.boolean(),
      orgRateLimit: v.boolean(),
      serverSideIntegrity: v.boolean(),
      strictJsonValidation: v.boolean(),
      promptVersioning: v.boolean(),
      aiRegressionEnforcement: v.boolean(),
      apiV1Routing: v.boolean(),
      adminDashboard: v.boolean(),
      multiInstitutionAnalytics: v.boolean(),
      costGovernance: v.boolean(),
    }),
  }),
  handler: async (ctx) => {
    const { profile } = await requireAuthWithProfile(ctx);
    return { flags: getFeatureFlagSnapshot(profile.organizationId) };
  },
});

export const setOrganizationFeatureFlagValue = mutation({
  args: {
    flag: featureFlagValidator,
    enabled: v.boolean(),
  },
  returns: v.object({
    updated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    requireOrganizationAdmin(profile.role);
    setOrganizationFeatureFlag(profile.organizationId, args.flag as FeatureFlag, args.enabled);
    await writeAuditLog({
      ctx: ctx as any,
      organizationId: profile.organizationId as any,
      actorId: userId as any,
      eventType: "feature_flag.updated",
      resourceType: "featureFlag",
      resourceId: args.flag,
      metadata: { enabled: args.enabled },
    });
    return { updated: true };
  },
});

export const clearOrganizationFeatureFlagValue = mutation({
  args: {
    flag: featureFlagValidator,
  },
  returns: v.object({
    cleared: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    requireOrganizationAdmin(profile.role);
    clearOrganizationFeatureFlag(profile.organizationId, args.flag as FeatureFlag);
    await writeAuditLog({
      ctx: ctx as any,
      organizationId: profile.organizationId as any,
      actorId: userId as any,
      eventType: "feature_flag.cleared",
      resourceType: "featureFlag",
      resourceId: args.flag,
    });
    return { cleared: true };
  },
});

export const getIntegrityDashboard = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    metrics: v.union(
      v.object({
        activeSessions: v.number(),
        totalTabSwitches: v.number(),
        totalCopyPasteAttempts: v.number(),
        totalViolations: v.number(),
      }),
      v.null(),
    ),
  }),
  handler: async (ctx) => {
    const { profile } = await requireAuthWithProfile(ctx);
    requireOrganizationAdmin(profile.role);

    if (!isFeatureEnabled("integrityDashboard", profile.organizationId)) {
      return { enabled: false, metrics: null };
    }

    const locks = await ctx.db
      .query("sessionLocks")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();

    return {
      enabled: true,
      metrics: buildIntegritySummary(locks),
    };
  },
});

export const systemObservabilityHealth = mutation({
  args: {},
  returns: v.object({
    logEmissionOk: v.boolean(),
    aiUsageMetricsOk: v.boolean(),
    integrityMetricsOk: v.boolean(),
    details: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    requireOrganizationAdmin(profile.role);

    const details: string[] = [];
    logEvent({
      event: "system.observability.health_check",
      organizationId: profile.organizationId,
      payload: { userId: String(userId) },
    });
    const logEmissionOk = true;

    let aiUsageMetricsOk = false;
    if (!isFeatureEnabled("aiUsageMetrics", profile.organizationId)) {
      details.push("aiUsageMetrics feature is disabled");
    } else {
      const assignment = await ctx.db
        .query("assignments")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
        .first();
      if (!assignment) {
        details.push("No assignment found for aiUsageMetrics probe");
      } else {
        try {
          await ctx.db.insert("aiUsageMetrics", {
            organizationId: profile.organizationId,
            studentId: userId,
            assignmentId: assignment._id,
            tokensUsed: 0,
            model: "healthcheck_probe",
            createdAt: Date.now(),
          });
          aiUsageMetricsOk = true;
        } catch (error) {
          details.push(`aiUsageMetrics probe failed: ${error instanceof Error ? error.message : "unknown"}`);
        }
      }
    }

    const integrityMetricsOk = isFeatureEnabled("integrityDashboard", profile.organizationId);
    if (!integrityMetricsOk) {
      details.push("integrityDashboard feature is disabled");
    }

    return {
      logEmissionOk,
      aiUsageMetricsOk,
      integrityMetricsOk,
      details,
    };
  },
});

export const runLegacyOrganizationBackfill = mutation({
  args: {
    defaultName: v.optional(v.string()),
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    patchedUsers: v.number(),
    patchedAssignments: v.number(),
    patchedJobs: v.number(),
    patchedAttempts: v.number(),
    patchedAlerts: v.number(),
    patchedAiInteractions: v.number(),
    patchedSessionLocks: v.number(),
  }),
  handler: async (ctx, args): Promise<LegacyBackfillResult> => {
    const userId = await requireAuth(ctx);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!profile || profile.role !== "organizationAdmin") {
      throw new Error("Only organization admins can run legacy backfill");
    }
    const result = await ctx.runMutation(internal.migrations.backfillDefaultOrganization, {
      defaultName: args.defaultName,
    });
    return result as LegacyBackfillResult;
  },
});

export const getLegacyOrganizationIntegrityStatus = internalQuery({
  args: {},
  returns: v.object({
    missingAssignments: v.number(),
    missingFacultyJobs: v.number(),
    missingAttempts: v.number(),
    missingDependencyAlerts: v.number(),
    missingAiInteractions: v.number(),
    missingSessionLocks: v.number(),
    missingAiUsageMetrics: v.number(),
    missingAuditLogs: v.number(),
    missingRateLimitCounters: v.number(),
    missingPromptVersionEvents: v.number(),
    missingCostPolicies: v.number(),
    missingCostDaily: v.number(),
  }),
  handler: async (ctx) => {
    const assignments = await ctx.db.query("assignments").collect();
    const facultyJobs = await ctx.db.query("facultyAssignmentJobs").collect();
    const attempts = await ctx.db.query("attempts").collect();
    const dependencyAlerts = await ctx.db.query("dependencyAlerts").collect();
    const aiInteractions = await ctx.db.query("aiInteractions").collect();
    const sessionLocks = await ctx.db.query("sessionLocks").collect();
    const aiUsageMetrics = await ctx.db.query("aiUsageMetrics").collect();
    const auditLogs = await ctx.db.query("auditLogs").collect();
    const rateLimitCounters = await ctx.db.query("orgRateLimitCounters").collect();
    const promptVersionEvents = await ctx.db.query("promptVersionEvents").collect();
    const costPolicies = await ctx.db.query("costGovernancePolicies").collect();
    const costDaily = await ctx.db.query("costGovernanceDaily").collect();

    return {
      missingAssignments: assignments.filter((d: any) => !d.organizationId).length,
      missingFacultyJobs: facultyJobs.filter((d: any) => !d.organizationId).length,
      missingAttempts: attempts.filter((d: any) => !d.organizationId).length,
      missingDependencyAlerts: dependencyAlerts.filter((d: any) => !d.organizationId).length,
      missingAiInteractions: aiInteractions.filter((d: any) => !d.organizationId).length,
      missingSessionLocks: sessionLocks.filter((d: any) => !d.organizationId).length,
      missingAiUsageMetrics: aiUsageMetrics.filter((d: any) => !d.organizationId).length,
      missingAuditLogs: auditLogs.filter((d: any) => !d.organizationId).length,
      missingRateLimitCounters: rateLimitCounters.filter((d: any) => !d.organizationId).length,
      missingPromptVersionEvents: promptVersionEvents.filter((d: any) => !d.organizationId).length,
      missingCostPolicies: costPolicies.filter((d: any) => !d.organizationId).length,
      missingCostDaily: costDaily.filter((d: any) => !d.organizationId).length,
    };
  },
});
