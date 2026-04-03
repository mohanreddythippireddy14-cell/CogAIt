import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";

function assertFaculty(role: string) {
  if (role !== "lecturer" && role !== "organizationAdmin") {
    throw new Error("Only faculty can access interventions.");
  }
}

export const sendLecturerHint = mutation({
  args: {
    assignmentId: v.id("assignments"),
    studentId: v.id("users"),
    message: v.string(),
  },
  returns: v.id("lecturerHints"),
  handler: async (ctx, args) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
    assertFaculty(profile.role);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);
    if (profile.role === "lecturer" && assignment.lecturerId !== userId) {
      throw new Error("Access denied");
    }
    const message = args.message.trim();
    if (message.length < 3) {
      throw new Error("Hint is too short.");
    }
    return await ctx.db.insert("lecturerHints", {
      organizationId: profile.organizationId,
      assignmentId: args.assignmentId,
      studentId: args.studentId,
      lecturerId: userId,
      message,
      createdAt: Date.now(),
      deliveredAt: Date.now(),
      readAt: undefined,
    });
  },
});

export const getStudentHints = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      _id: v.id("lecturerHints"),
      message: v.string(),
      createdAt: v.number(),
      readAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);
    const rows = await ctx.db
      .query("lecturerHints")
      .withIndex("by_org_assignment_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId).eq("studentId", userId),
      )
      .order("asc")
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      message: row.message,
      createdAt: row.createdAt,
      readAt: row.readAt,
    }));
  },
});

export const markHintRead = mutation({
  args: {
    hintId: v.id("lecturerHints"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
    const hint = await ctx.db.get(args.hintId);
    if (!hint) {
      return false;
    }
    requireSameOrganization(hint.organizationId, profile.organizationId);
    if (hint.studentId !== userId) {
      throw new Error("Access denied");
    }
    if (!hint.readAt) {
      await ctx.db.patch(args.hintId, { readAt: Date.now() });
    }
    return true;
  },
});

export const getNeedsReviewCount = query({
  args: {},
  returns: v.object({
    count: v.number(),
  }),
  handler: async (ctx) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
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
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const locks = await ctx.db
      .query("sessionLocks")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const lockByStudentAssignment = new Map(
      locks.map((row) => [`${row.studentId.toString()}:${row.assignmentId.toString()}`, row]),
    );

    const grouped = new Map<string, typeof attempts>();
    for (const attempt of attempts) {
      if (!assignmentIds.has(attempt.assignmentId.toString())) {
        continue;
      }
      const key = `${attempt.studentId.toString()}:${attempt.assignmentId.toString()}`;
      const list = grouped.get(key) ?? [];
      list.push(attempt);
      grouped.set(key, list);
    }

    let count = 0;
    for (const [key, rows] of grouped.entries()) {
      const [studentKey, assignmentKey] = key.split(":");
      const assignment = assignments.find((a) => a._id.toString() === assignmentKey);
      if (!assignment) continue;
      const answered = rows.filter((r) => (r.studentAnswer ?? "").trim().length > 0).length;
      const deepHelp = rows.reduce((sum, r) => sum + r.helpLevelsUsed.filter((x) => x === 4).length, 0);
      const totalHelp = rows.reduce((sum, r) => sum + r.helpLevelsUsed.length, 0);
      const level4Ratio = totalHelp > 0 ? deepHelp / totalHelp : 0;
      const minCis = rows.reduce((min, r) => Math.min(min, r.cognitiveScore ?? 100), 100);
      const lock = lockByStudentAssignment.get(`${studentKey}:${assignmentKey}`);

      if (
        answered < Math.ceil(assignment.totalQuestions * 0.3) ||
        level4Ratio > 0.6 ||
        (lock?.tabSwitchCount ?? 0) >= 3 ||
        minCis < 15
      ) {
        count += 1;
      }
    }
    return { count };
  },
});
