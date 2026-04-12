import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "./lib/authGuards";
import { isFeatureEnabled } from "./infrastructure/featureFlags";

export const consumeOrgRateLimit = mutation({
  args: {
    key: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  returns: v.object({
    allowed: v.boolean(),
    remaining: v.number(),
    retryAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const { profile } = await requireAuthWithProfile(ctx);
    if (!isFeatureEnabled("orgRateLimit", profile.organizationId)) {
      return { allowed: true, remaining: args.limit };
    }

    const now = Date.now();
    const safeWindowMs = Math.max(1000, args.windowMs);
    const windowStart = now - (now % safeWindowMs);
    const counter = await ctx.db
      .query("orgRateLimitCounters")
      .withIndex("by_org_key_window", (q) =>
        q.eq("organizationId", profile.organizationId).eq("key", args.key).eq("windowStart", windowStart),
      )
      .first();

    if (!counter) {
      await ctx.db.insert("orgRateLimitCounters", {
        organizationId: profile.organizationId,
        key: args.key,
        windowStart,
        count: 1,
        limit: args.limit,
        updatedAt: now,
      });
      return { allowed: true, remaining: Math.max(0, args.limit - 1) };
    }

    if (counter.count >= args.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAt: windowStart + safeWindowMs,
      };
    }

    await ctx.db.patch(counter._id, {
      count: counter.count + 1,
      limit: args.limit,
      updatedAt: now,
    });
    return {
      allowed: true,
      remaining: Math.max(0, args.limit - (counter.count + 1)),
    };
  },
});
