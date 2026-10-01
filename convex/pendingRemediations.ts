import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const preferenceValidator = v.union(
  v.literal("pyqs"),
  v.literal("fundamentals"),
  v.literal("theory"),
  v.literal("all"),
);

/**
 * Creates a pending remediation offer from the negotiation node.
 * This is the only entry point that stores the "awaiting_consent" record in Convex.
 */
export const createPending = mutation({
  args: {
    student_id: v.string(),
    assignment_id: v.string(),
    weak_topics: v.array(v.string()),
    expires_at: v.number(),
  },
  returns: v.id("pendingRemediations"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("pendingRemediations", {
      student_id: args.student_id,
      assignment_id: args.assignment_id,
      weak_topics: args.weak_topics,
      status: "awaiting_consent",
      created_at: Date.now(),
      expires_at: args.expires_at,
    });
  },
});

/**
 * Lists active consent offers for a student/assignment pair so the UI can render a non-blocking consent panel.
 */
export const listAwaiting = query({
  args: {
    student_id: v.string(),
    assignment_id: v.optional(v.string()),
  },
  returns: v.array(
    v.object({
      _id: v.id("pendingRemediations"),
      student_id: v.string(),
      assignment_id: v.string(),
      weak_topics: v.array(v.string()),
      status: v.union(
        v.literal("awaiting_consent"),
        v.literal("accepted"),
        v.literal("declined"),
        v.literal("expired"),
      ),
      created_at: v.number(),
      expires_at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pendingRemediations")
      .withIndex("by_student_status", (q) =>
        q.eq("student_id", args.student_id).eq("status", "awaiting_consent"),
      )
      .collect();

    const filtered = args.assignment_id
      ? rows.filter((row) => row.assignment_id === args.assignment_id)
      : rows;

    return filtered.map((row) => ({
      _id: row._id,
      student_id: row.student_id,
      assignment_id: row.assignment_id,
      weak_topics: row.weak_topics,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
    }));
  },
});

/**
 * Fetches a pending remediation record by id for test verification.
 */
export const getById = query({
  args: { pending_remediation_id: v.id("pendingRemediations") },
  returns: v.union(
    v.object({
      _id: v.id("pendingRemediations"),
      student_id: v.string(),
      assignment_id: v.string(),
      weak_topics: v.array(v.string()),
      status: v.union(
        v.literal("awaiting_consent"),
        v.literal("accepted"),
        v.literal("declined"),
        v.literal("expired"),
      ),
      created_at: v.number(),
      expires_at: v.number(),
      preference: v.optional(preferenceValidator),
      responded_at: v.optional(v.number()),
      decline_reason: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pending_remediation_id);
    if (!row) return null;
    return {
      _id: row._id,
      student_id: row.student_id,
      assignment_id: row.assignment_id,
      weak_topics: row.weak_topics,
      status: row.status,
      created_at: row.created_at,
      expires_at: row.expires_at,
      preference: row.preference,
      responded_at: row.responded_at,
      decline_reason: row.decline_reason,
    };
  },
});

/**
 * Updates the expiry timestamp on a pending remediation record (used by tests).
 */
export const updateExpiry = mutation({
  args: {
    pending_remediation_id: v.id("pendingRemediations"),
    expires_at: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.pending_remediation_id, { expires_at: args.expires_at });
    return null;
  },
});

/**
 * Applies the student's explicit consent decision and returns the updated status row.
 */
export const respond = mutation({
  args: {
    pending_remediation_id: v.id("pendingRemediations"),
    student_id: v.string(),
    consent: v.boolean(),
    preference: v.optional(preferenceValidator),
  },
  returns: v.union(
    v.object({
      ok: v.boolean(),
      reason: v.string(),
      record: v.object({
        pending_remediation_id: v.id("pendingRemediations"),
        assignment_id: v.string(),
        student_id: v.string(),
        weak_topics: v.array(v.string()),
        status: v.union(
          v.literal("accepted"),
          v.literal("declined"),
          v.literal("expired"),
        ),
        preference: v.optional(preferenceValidator),
      }),
    }),
    v.object({
      ok: v.boolean(),
      reason: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.pending_remediation_id);
    if (!row) {
      return { ok: false, reason: "pending_remediation_not_found" };
    }
    if (row.student_id !== args.student_id) {
      return { ok: false, reason: "student_mismatch" };
    }
    if (row.status !== "awaiting_consent") {
      return { ok: false, reason: `already_${row.status}` };
    }
    if (Date.now() > row.expires_at) {
      await ctx.db.patch(row._id, {
        status: "expired",
        responded_at: Date.now(),
        decline_reason: "timeout",
      });
      return {
        ok: true,
        reason: "expired_before_response",
        record: {
          pending_remediation_id: row._id,
          assignment_id: row.assignment_id,
          student_id: row.student_id,
          weak_topics: row.weak_topics,
          status: "expired",
        },
      };
    }

    if (args.consent) {
      if (!args.preference) {
        return { ok: false, reason: "preference_required_when_consent_true" };
      }
      await ctx.db.patch(row._id, {
        status: "accepted",
        preference: args.preference,
        responded_at: Date.now(),
      });
      return {
        ok: true,
        reason: "accepted",
        record: {
          pending_remediation_id: row._id,
          assignment_id: row.assignment_id,
          student_id: row.student_id,
          weak_topics: row.weak_topics,
          status: "accepted",
          preference: args.preference,
        },
      };
    }

    await ctx.db.patch(row._id, {
      status: "declined",
      responded_at: Date.now(),
      decline_reason: "student_declined",
    });
    return {
      ok: true,
      reason: "declined",
      record: {
        pending_remediation_id: row._id,
        assignment_id: row.assignment_id,
        student_id: row.student_id,
        weak_topics: row.weak_topics,
        status: "declined",
      },
    };
  },
});

/**
 * Expires stale remediation offers and returns all records transitioned to "expired".
 */
export const expireDue = mutation({
  args: { now_ts: v.number() },
  returns: v.array(
    v.object({
      pending_remediation_id: v.id("pendingRemediations"),
      student_id: v.string(),
      assignment_id: v.string(),
      weak_topics: v.array(v.string()),
      status: v.literal("expired"),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pendingRemediations")
      .withIndex("by_status_expires", (q) =>
        q.eq("status", "awaiting_consent").lte("expires_at", args.now_ts),
      )
      .collect();

    const expired: Array<{
      pending_remediation_id: string;
      student_id: string;
      assignment_id: string;
      weak_topics: string[];
      status: "expired";
    }> = [];

    for (const row of rows) {
      await ctx.db.patch(row._id, {
        status: "expired",
        responded_at: args.now_ts,
        decline_reason: "timeout",
      });
      expired.push({
        pending_remediation_id: row._id,
        student_id: row.student_id,
        assignment_id: row.assignment_id,
        weak_topics: row.weak_topics,
        status: "expired",
      });
    }

    return expired.map((item) => ({
      ...item,
      pending_remediation_id: item.pending_remediation_id as never,
    }));
  },
});
