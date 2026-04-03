import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "../lib/authGuards";

function assertFaculty(role: string) {
  if (role !== "lecturer" && role !== "organizationAdmin") {
    throw new Error("Only faculty can access alerts.");
  }
}

export const getActiveAlerts = query({
  args: {
    severity: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
  },
  returns: v.array(
    v.object({
      alertId: v.id("dependencyAlerts"),
      studentId: v.id("users"),
      assignmentId: v.id("assignments"),
      severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
      alertType: v.union(
        v.literal("high_help_frequency"),
        v.literal("low_independence"),
        v.literal("increasing_dependency"),
        v.literal("level_4_overuse"),
      ),
      message: v.string(),
      timestamp: v.number(),
      acknowledged: v.boolean(),
      acknowledgedBy: v.optional(v.id("users")),
      acknowledgedAt: v.optional(v.number()),
      interventionNotes: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    assertFaculty(profile.role);
    const assignments = profile.role === "organizationAdmin"
      ? await ctx.db
          .query("assignments")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
          .collect()
      : await ctx.db
          .query("assignments")
          .withIndex("by_org_and_lecturer", (q) =>
            q.eq("organizationId", profile.organizationId).eq("lecturerId", userId),
          )
          .collect();
    const assignmentIds = new Set(assignments.map((row) => row._id.toString()));
    const rows = await ctx.db
      .query("dependencyAlerts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    return rows
      .filter((row) => assignmentIds.has(row.assignmentId.toString()))
      .filter((row) => !row.acknowledged)
      .filter((row) => !args.severity || row.severity === args.severity)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((row) => ({
        alertId: row._id,
        studentId: row.studentId,
        assignmentId: row.assignmentId,
        severity: row.severity,
        alertType: row.alertType,
        message: row.message,
        timestamp: row.timestamp,
        acknowledged: row.acknowledged,
        acknowledgedBy: row.acknowledgedBy,
        acknowledgedAt: row.acknowledgedAt,
        interventionNotes: row.interventionNotes,
      }));
  },
});

export const acknowledgeAlert = mutation({
  args: {
    alertId: v.id("dependencyAlerts"),
    interventionNotes: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    assertFaculty(profile.role);
    const alert = await ctx.db.get(args.alertId);
    if (!alert || alert.organizationId !== profile.organizationId) {
      throw new Error("Alert not found.");
    }
    await ctx.db.patch(args.alertId, {
      acknowledged: true,
      acknowledgedBy: userId,
      acknowledgedAt: Date.now(),
      interventionNotes: args.interventionNotes?.trim() || undefined,
    });
    return true;
  },
});
