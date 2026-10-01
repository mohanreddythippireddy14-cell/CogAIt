/**
 * DEPRECATION STATUS: Intelligence generation removed 2026-04-14.
 * This file is now a raw session data recorder only.
 * All performance analysis is canonical in the agents/ layer (Agent 2 → 4 → 6 → 7).
 * Do not add intelligence logic here. Any new analysis belongs in agent2_analyst/.
 */
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { requireAuthWithProfile, requireAuthFromAction } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";

// -------------------------------------------------------------------
// Queries
// -------------------------------------------------------------------
export const getDeepDiveStatus = query({
  args: { sourceAssignmentId: v.id("assignments") },
  returns: v.union(
    v.object({
      _id: v.id("deepDiveSessions"),
      status: v.union(
        v.literal("pending"),
        v.literal("generating"),
        v.literal("ready"),
        v.literal("failed"),
      ),
      generatedAssignmentId: v.optional(v.id("assignments")),
      questionCount: v.optional(v.number()),
      error: v.optional(v.string()),
      weakTopics: v.array(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const session = await ctx.db
      .query("deepDiveSessions")
      .withIndex("by_org_source_student", (q) =>
        q
          .eq("organizationId", profile.organizationId)
          .eq("sourceAssignmentId", args.sourceAssignmentId)
          .eq("studentId", userId),
      )
      .order("desc")
      .first();

    if (!session) return null;

    return {
      _id: session._id,
      status: session.status,
      generatedAssignmentId: session.generatedAssignmentId,
      questionCount: session.questionCount,
      error: session.error,
      weakTopics: session.weakTopics,
    };
  },
});

export const getStudentDeepDives = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("deepDiveSessions"),
      sourceAssignmentId: v.id("assignments"),
      weakTopics: v.array(v.string()),
      status: v.union(
        v.literal("pending"),
        v.literal("generating"),
        v.literal("ready"),
        v.literal("failed"),
      ),
      generatedAssignmentId: v.optional(v.id("assignments")),
      questionCount: v.optional(v.number()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const sessions = await ctx.db
      .query("deepDiveSessions")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId),
      )
      .order("desc")
      .collect();

    return sessions.map((s) => ({
      _id: s._id,
      sourceAssignmentId: s.sourceAssignmentId,
      weakTopics: s.weakTopics,
      status: s.status,
      generatedAssignmentId: s.generatedAssignmentId,
      questionCount: s.questionCount,
      createdAt: s.createdAt,
    }));
  },
});

// -------------------------------------------------------------------
// Mutations
// -------------------------------------------------------------------
export const createSession = mutation({
  args: {
    sourceAssignmentId: v.id("assignments"),
    weakTopics: v.array(v.string()),
    studentPreferences: v.optional(v.string()),
  },
  returns: v.id("deepDiveSessions"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    // Check for existing pending/generating session
    const existing = await ctx.db
      .query("deepDiveSessions")
      .withIndex("by_org_source_student", (q) =>
        q
          .eq("organizationId", profile.organizationId)
          .eq("sourceAssignmentId", args.sourceAssignmentId)
          .eq("studentId", userId),
      )
      .order("desc")
      .first();

    if (existing && (existing.status === "pending" || existing.status === "generating")) {
      return existing._id;
    }

    return await ctx.db.insert("deepDiveSessions", {
      organizationId: profile.organizationId,
      studentId: userId,
      sourceAssignmentId: args.sourceAssignmentId,
      weakTopics: args.weakTopics,
      studentPreferences: args.studentPreferences,
      status: "pending",
      createdAt: Date.now(),
    });
  },
});

export const updateSessionStatus = mutation({
  args: {
    sessionId: v.id("deepDiveSessions"),
    status: v.union(
      v.literal("pending"),
      v.literal("generating"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    generatedAssignmentId: v.optional(v.id("assignments")),
    questionCount: v.optional(v.number()),
    webSources: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireAuthWithProfile(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    requireSameOrganization(session.organizationId, profile.organizationId);

    await ctx.db.patch(args.sessionId, {
      status: args.status,
      generatedAssignmentId: args.generatedAssignmentId,
      questionCount: args.questionCount,
      webSources: args.webSources,
      error: args.error,
    });
    return null;
  },
});

// -------------------------------------------------------------------
// Main action: record deep-dive intent only (no generation here)
// -------------------------------------------------------------------
export const generateDeepDive = action({
  args: {
    sourceAssignmentId: v.id("assignments"),
    weakTopics: v.array(v.string()),
    studentPreferences: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuthFromAction(ctx);

    // REMOVED: LLM-based deep-dive assignment generation — see Agent 2
    const sessionId = await ctx.runMutation(api.deepDive.createSession, {
      sourceAssignmentId: args.sourceAssignmentId,
      weakTopics: args.weakTopics,
      studentPreferences: args.studentPreferences,
    });

    await ctx.runMutation(api.deepDive.updateSessionStatus, {
      sessionId,
      status: "failed",
      error:
        "Deep-dive generation is handled by the agents layer. This endpoint now records intent only.",
    });

    return null;
  },
});

// -------------------------------------------------------------------
// Mutation to create the deep-dive assignment + questions in one go
// -------------------------------------------------------------------
export const insertDeepDiveAssignment = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    classroomId: v.optional(v.id("classrooms")),
    sourceAssignmentId: v.id("assignments"),
    timeLimitMinutes: v.number(),
    questions: v.array(
      v.object({
        questionNumber: v.number(),
        questionText: v.string(),
        subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
        topic: v.string(),
        subtopic: v.optional(v.string()),
        difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
        correctAnswer: v.optional(v.string()),
        givenVariables: v.optional(v.string()),
      }),
    ),
  },
  returns: v.id("assignments"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const sourceAssignment = await ctx.db.get(args.sourceAssignmentId);
    if (!sourceAssignment) throw new Error("Source assignment not found");
    requireSameOrganization(sourceAssignment.organizationId, profile.organizationId);

    const assignmentId = await ctx.db.insert("assignments", {
      organizationId: profile.organizationId,
      lecturerId: sourceAssignment.lecturerId,
      classroomId: args.classroomId,
      title: args.title,
      description: args.description,
      timeLimitMinutes: args.timeLimitMinutes,
      totalQuestions: args.questions.length,
      isActive: true,
      publishedAt: Date.now(),
      targetStudentId: userId,
      isDeepDive: true,
      sourceAssignmentId: args.sourceAssignmentId,
    });

    for (const q of args.questions) {
      await ctx.db.insert("questions", {
        assignmentId,
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        subject: q.subject,
        topic: q.topic,
        subtopic: q.subtopic,
        difficulty: q.difficulty,
        correctAnswer: q.correctAnswer,
        givenVariables: q.givenVariables,
      });
    }

    return assignmentId;
  },
});
