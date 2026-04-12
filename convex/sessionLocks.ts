import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";
import { isFeatureEnabled } from "./infrastructure/featureFlags";
import { writeAuditLog } from "./infrastructure/auditTrail";
import { VIOLATION_LIMITS } from "./constants";

const violationValidator = v.object({
  type: v.string(),
  timestamp: v.number(),
  details: v.string(),
});

export const startSession = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.id("sessionLocks"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);

    const now = Date.now();
    const existing = await ctx.db
      .query("sessionLocks")
      .withIndex("by_org_and_student_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId).eq("assignmentId", args.assignmentId),
      )
      .first();

    if (existing) {
      const staleSession = Date.now() - existing.lastHeartbeat > 2 * 60 * 1000;
      await ctx.db.patch(existing._id, {
        isLocked: true,
        tabSwitchCount: staleSession ? 0 : existing.tabSwitchCount,
        copyPasteAttempts: staleSession ? 0 : existing.copyPasteAttempts,
        violationWarnings: staleSession ? [] : existing.violationWarnings,
        lastHeartbeat: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("sessionLocks", {
      organizationId: profile.organizationId,
      studentId: userId,
      assignmentId: args.assignmentId,
      isLocked: true,
      tabSwitchCount: 0,
      copyPasteAttempts: 0,
      violationWarnings: [],
      startedAt: now,
      lastHeartbeat: now,
    });
  },
});

export const updateHeartbeat = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const lock = await ctx.db
      .query("sessionLocks")
      .withIndex("by_org_and_student_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId).eq("assignmentId", args.assignmentId),
      )
      .first();

    if (!lock) {
      return false;
    }

    await ctx.db.patch(lock._id, {
      lastHeartbeat: Date.now(),
    });
    return true;
  },
});

export const logViolation = mutation({
  args: {
    assignmentId: v.id("assignments"),
    type: v.union(v.literal("tabSwitch"), v.literal("copyPaste")),
    details: v.string(),
  },
  returns: v.object({
    violationCount: v.number(),
    tabSwitchCount: v.number(),
    copyPasteAttempts: v.number(),
    shouldAutoSubmit: v.boolean(),
    warning: v.optional(violationValidator),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const lock = await ctx.db
      .query("sessionLocks")
      .withIndex("by_org_and_student_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId).eq("assignmentId", args.assignmentId),
      )
      .first();
    if (!lock) {
      throw new Error("Session not found");
    }

    const warningDetails = isFeatureEnabled("serverSideIntegrity", profile.organizationId)
      ? `Server-observed ${args.type} event`
      : args.details;

    const warning = {
      type: args.type,
      timestamp: Date.now(),
      details: warningDetails,
    };

    const tabSwitchCount =
      args.type === "tabSwitch" ? lock.tabSwitchCount + 1 : lock.tabSwitchCount;
    const copyPasteAttempts =
      args.type === "copyPaste" ? lock.copyPasteAttempts + 1 : lock.copyPasteAttempts;

    const violationWarnings = [...lock.violationWarnings, warning];

    await ctx.db.patch(lock._id, {
      tabSwitchCount,
      copyPasteAttempts,
      violationWarnings,
      lastHeartbeat: Date.now(),
    });

    const shouldAutoSubmit = violationWarnings.length >= VIOLATION_LIMITS.autoSubmitViolations;

    await writeAuditLog({
      ctx: ctx as any,
      organizationId: profile.organizationId as any,
      actorId: userId as any,
      eventType: "integrity.violation.logged",
      resourceType: "sessionLock",
      resourceId: lock._id as any,
      metadata: {
        assignmentId: String(args.assignmentId),
        type: args.type,
        autoSubmit: shouldAutoSubmit,
      },
    });

    return {
      violationCount: violationWarnings.length,
      tabSwitchCount,
      copyPasteAttempts,
      shouldAutoSubmit,
      warning,
    };
  },
});

export const endSession = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const lock = await ctx.db
      .query("sessionLocks")
      .withIndex("by_org_and_student_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId).eq("assignmentId", args.assignmentId),
      )
      .first();
    if (!lock) {
      return false;
    }

    await ctx.db.patch(lock._id, {
      isLocked: false,
      lastHeartbeat: Date.now(),
    });
    return true;
  },
});
