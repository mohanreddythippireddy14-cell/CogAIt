import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "./lib/authGuards";
import { isFeatureEnabled } from "./infrastructure/featureFlags";
import { evaluateCostGovernanceDecision, shouldBlockAiRequest } from "./domain/costGovernance";

function dayStartMs(now: number) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function requireOrgAdmin(role: "student" | "lecturer" | "organizationAdmin") {
  if (role !== "organizationAdmin") {
    throw new Error("Only organization admins can perform this action");
  }
}

async function getOrCreatePolicy(ctx: any, organizationId: any, userId: any, now: number) {
  let policy = await ctx.db
    .query("costGovernancePolicies")
    .withIndex("by_organizationId", (q: any) => q.eq("organizationId", organizationId))
    .first();
  if (!policy) {
    const id = await ctx.db.insert("costGovernancePolicies", {
      organizationId,
      dailyTokenCap: 200000,
      softWarningThreshold: 0.8,
      adminOverrideUntil: undefined,
      isActive: true,
      updatedBy: userId,
      updatedAt: now,
    });
    policy = await ctx.db.get(id);
  }
  return policy;
}

export const setCostGovernancePolicy = mutation({
  args: {
    dailyTokenCap: v.number(),
    softWarningThreshold: v.number(),
    isActive: v.boolean(),
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    requireOrgAdmin(profile.role);
    if (!isFeatureEnabled("costGovernance", profile.organizationId)) {
      throw new Error("costGovernance feature is disabled");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("costGovernancePolicies")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        dailyTokenCap: Math.max(1, Math.floor(args.dailyTokenCap)),
        softWarningThreshold: Math.min(1, Math.max(0, args.softWarningThreshold)),
        isActive: args.isActive,
        updatedBy: userId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("costGovernancePolicies", {
        organizationId: profile.organizationId,
        dailyTokenCap: Math.max(1, Math.floor(args.dailyTokenCap)),
        softWarningThreshold: Math.min(1, Math.max(0, args.softWarningThreshold)),
        adminOverrideUntil: undefined,
        isActive: args.isActive,
        updatedBy: userId,
        updatedAt: now,
      });
    }
    return { updated: true };
  },
});

export const setCostGovernanceAdminOverride = mutation({
  args: {
    overrideUntil: v.optional(v.number()),
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    requireOrgAdmin(profile.role);
    if (!isFeatureEnabled("costGovernance", profile.organizationId)) {
      throw new Error("costGovernance feature is disabled");
    }
    const now = Date.now();
    const policy = await getOrCreatePolicy(ctx, profile.organizationId, userId, now);
    await ctx.db.patch(policy._id, {
      adminOverrideUntil: args.overrideUntil,
      updatedBy: userId,
      updatedAt: now,
    });
    return { updated: true };
  },
});

export const evaluateBeforeAi = mutation({
  args: {
    requestedTokens: v.number(),
  },
  returns: v.object({
    allowed: v.boolean(),
    hardStop: v.boolean(),
    softWarning: v.boolean(),
    anomaly: v.boolean(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const enabled = isFeatureEnabled("costGovernance", profile.organizationId);
    if (!enabled) {
      return { allowed: true, hardStop: false, softWarning: false, anomaly: false, remaining: Number.MAX_SAFE_INTEGER };
    }
    const now = Date.now();
    const policy = await getOrCreatePolicy(ctx, profile.organizationId, userId, now);
    if (!policy.isActive) {
      return { allowed: true, hardStop: false, softWarning: false, anomaly: false, remaining: Number.MAX_SAFE_INTEGER };
    }
    const dayStart = dayStartMs(now);
    const daily = await ctx.db
      .query("costGovernanceDaily")
      .withIndex("by_org_and_day", (q) => q.eq("organizationId", profile.organizationId).eq("dayStart", dayStart))
      .first();
    const decision = evaluateCostGovernanceDecision({
      currentTokensUsed: daily?.tokensUsed ?? 0,
      requestedTokens: Math.max(0, Math.floor(args.requestedTokens)),
      dailyCap: policy.dailyTokenCap,
      softWarningThreshold: policy.softWarningThreshold,
      adminOverrideUntil: policy.adminOverrideUntil,
      hardStopTriggered: daily?.hardStopTriggered ?? false,
      now,
    });
    const allowed = !shouldBlockAiRequest({
      costGovernanceEnabled: enabled,
      hardStop: decision.hardStop,
    });
    if (!allowed && daily && !daily.hardStopTriggered) {
      await ctx.db.patch(daily._id, { hardStopTriggered: true, lastUpdated: now });
    }
    return {
      allowed,
      hardStop: decision.hardStop,
      softWarning: decision.softWarning,
      anomaly: decision.anomaly,
      remaining: decision.remaining,
    };
  },
});

export const recordAiUsage = mutation({
  args: {
    tokensUsed: v.number(),
  },
  returns: v.object({
    hardStop: v.boolean(),
    softWarning: v.boolean(),
    anomaly: v.boolean(),
    tokensUsedToday: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const enabled = isFeatureEnabled("costGovernance", profile.organizationId);
    if (!enabled) {
      return {
        hardStop: false,
        softWarning: false,
        anomaly: false,
        tokensUsedToday: 0,
        remaining: Number.MAX_SAFE_INTEGER,
      };
    }
    const now = Date.now();
    const policy = await getOrCreatePolicy(ctx, profile.organizationId, userId, now);
    if (!policy.isActive) {
      return {
        hardStop: false,
        softWarning: false,
        anomaly: false,
        tokensUsedToday: 0,
        remaining: Number.MAX_SAFE_INTEGER,
      };
    }
    const dayStart = dayStartMs(now);
    const existing = await ctx.db
      .query("costGovernanceDaily")
      .withIndex("by_org_and_day", (q) => q.eq("organizationId", profile.organizationId).eq("dayStart", dayStart))
      .first();
    const current = existing?.tokensUsed ?? 0;
    const nextUsed = current + Math.max(0, Math.floor(args.tokensUsed));
    const decision = evaluateCostGovernanceDecision({
      currentTokensUsed: nextUsed,
      requestedTokens: 0,
      dailyCap: policy.dailyTokenCap,
      softWarningThreshold: policy.softWarningThreshold,
      adminOverrideUntil: policy.adminOverrideUntil,
      hardStopTriggered: existing?.hardStopTriggered ?? false,
      now,
    });

    if (existing) {
      await ctx.db.patch(existing._id, {
        tokensUsed: nextUsed,
        hardStopTriggered: decision.hardStop,
        anomalyDetected: decision.anomaly,
        lastUpdated: now,
      });
    } else {
      await ctx.db.insert("costGovernanceDaily", {
        organizationId: profile.organizationId,
        dayStart,
        tokensUsed: nextUsed,
        hardStopTriggered: decision.hardStop,
        anomalyDetected: decision.anomaly,
        lastUpdated: now,
      });
    }
    return {
      hardStop: decision.hardStop,
      softWarning: decision.softWarning,
      anomaly: decision.anomaly,
      tokensUsedToday: nextUsed,
      remaining: decision.remaining,
    };
  },
});

export const getCostGovernanceDashboard = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    policy: v.union(
      v.object({
        dailyTokenCap: v.number(),
        softWarningThreshold: v.number(),
        adminOverrideUntil: v.optional(v.number()),
        isActive: v.boolean(),
      }),
      v.null(),
    ),
    today: v.union(
      v.object({
        tokensUsed: v.number(),
        hardStopTriggered: v.boolean(),
        anomalyDetected: v.boolean(),
      }),
      v.null(),
    ),
  }),
  handler: async (ctx) => {
    const { profile } = await requireAuthWithProfile(ctx);
    requireOrgAdmin(profile.role);
    if (!isFeatureEnabled("adminDashboard", profile.organizationId)) {
      return { enabled: false, policy: null, today: null };
    }
    const policy = await ctx.db
      .query("costGovernancePolicies")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .first();
    const today = await ctx.db
      .query("costGovernanceDaily")
      .withIndex("by_org_and_day", (q) => q.eq("organizationId", profile.organizationId).eq("dayStart", dayStartMs(Date.now())))
      .first();
    return {
      enabled: true,
      policy: policy
        ? {
            dailyTokenCap: policy.dailyTokenCap,
            softWarningThreshold: policy.softWarningThreshold,
            adminOverrideUntil: policy.adminOverrideUntil,
            isActive: policy.isActive,
          }
        : null,
      today: today
        ? {
            tokensUsed: today.tokensUsed,
            hardStopTriggered: today.hardStopTriggered,
            anomalyDetected: today.anomalyDetected,
          }
        : null,
    };
  },
});

export const getMultiInstitutionAnalytics = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    organizationsVisible: v.number(),
    note: v.string(),
  }),
  handler: async (ctx) => {
    const { profile } = await requireAuthWithProfile(ctx);
    requireOrgAdmin(profile.role);
    if (!isFeatureEnabled("multiInstitutionAnalytics", profile.organizationId)) {
      return {
        enabled: false,
        organizationsVisible: 1,
        note: "Feature disabled",
      };
    }
    // Security-preserving: organization admins remain scoped to their own organization.
    return {
      enabled: true,
      organizationsVisible: 1,
      note: "Scoped to current organization for tenant safety",
    };
  },
});
