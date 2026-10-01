/**
 * DEPRECATION STATUS: Intelligence generation removed 2026-04-14.
 * This file is now a raw session data recorder only.
 * All performance analysis is canonical in the agents/ layer (Agent 2 → 4 → 6 → 7).
 * Do not add intelligence logic here. Any new analysis belongs in agent2_analyst/.
 */
/**
 * DEPRECATION MAP
 * Stack B (Convex-native) writes:
 * - agentConversations: messages, weakTopics, deepDiveRequested, status
 * - deepDiveSessions: weakTopics, status, preferences, generatedAssignmentId
 * - assignments/questions (deep-dive assignment generation)
 *
 * Stack A (agents layer) writes:
 * - agent2 → long-term memory sessionHistory (agents/.memory files) + Pub/Sub events
 * - agent4/6/7 → long-term memory briefings/cohort summaries (agents/.memory files)
 *
 * Overlap/conflicts:
 * - weakTopics, CIS/heatmap-derived performance summaries, and remediation recommendations
 *   are generated in Stack B from attempts.getResultsReport and in Stack A via Agent 2/4.
 * - StudentResults chat panel reads Stack B's weakTopics/deepDiveRequested, causing drift.
 */
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { requireAuthWithProfile, requireAuthFromAction } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";

const messageValidator = v.object({
  role: v.union(v.literal("agent"), v.literal("student")),
  content: v.string(),
  timestamp: v.number(),
  messageId: v.optional(v.string()),
  inReplyTo: v.optional(v.string()),
});

// -------------------------------------------------------------------
// Queries
// -------------------------------------------------------------------
export const getConversation = query({
  args: { assignmentId: v.id("assignments") },
  returns: v.union(
    v.object({
      _id: v.id("agentConversations"),
      messages: v.array(messageValidator),
      status: v.union(v.literal("analyzing"), v.literal("negotiating"), v.literal("searching"), v.literal("active"), v.literal("closed")),
      deepDiveRequested: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "student") return null;

    const convo = await ctx.db
      .query("agentConversations")
      .withIndex("by_org_student_assignment", (q) =>
        q
          .eq("organizationId", profile.organizationId)
          .eq("studentId", userId)
          .eq("assignmentId", args.assignmentId),
      )
      .first();

    if (!convo) return null;

    return {
      _id: convo._id,
      messages: convo.messages,
      status: convo.status,
      deepDiveRequested: convo.deepDiveRequested,
    };
  },
});

// -------------------------------------------------------------------
// Mutations (internal helpers for the action)
// -------------------------------------------------------------------
export const createConversation = mutation({
  args: {
    assignmentId: v.id("assignments"),
    initialMessage: v.string(),
    weakTopics: v.array(v.string()),
  },
  returns: v.id("agentConversations"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    // Prevent duplicates
    const existing = await ctx.db
      .query("agentConversations")
      .withIndex("by_org_student_assignment", (q) =>
        q
          .eq("organizationId", profile.organizationId)
          .eq("studentId", userId)
          .eq("assignmentId", args.assignmentId),
      )
      .first();

    if (existing) return existing._id;

    return await ctx.db.insert("agentConversations", {
      organizationId: profile.organizationId,
      studentId: userId,
      assignmentId: args.assignmentId,
      messages: [
        {
          role: "agent" as const,
          content: args.initialMessage,
          timestamp: Date.now(),
        },
      ],
      status: "analyzing",
      deepDiveRequested: false,
      weakTopics: args.weakTopics,
      createdAt: Date.now(),
    });
  },
});

export const appendMessage = mutation({
  args: {
    conversationId: v.id("agentConversations"),
    role: v.union(v.literal("agent"), v.literal("student")),
    content: v.string(),
    messageId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireAuthWithProfile(ctx);
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) throw new Error("Conversation not found");
    requireSameOrganization(convo.organizationId, profile.organizationId);

    // Idempotency check for student messages
    if (args.messageId) {
      if (convo.messages.some(m => m.messageId === args.messageId)) {
        return null;
      }
    }

    await ctx.db.patch(args.conversationId, {
      messages: [
        ...convo.messages,
        { role: args.role, content: args.content, timestamp: Date.now(), messageId: args.messageId },
      ],
    });
    return null;
  },
});

export const getOrCreateConversation = mutation({
  args: {
    assignmentId: v.id("assignments"),
    studentId: v.id("users"),
  },
  returns: v.id("agentConversations"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("agentConversations")
      .withIndex("by_org_student_assignment", (q) =>
        q.eq("studentId", args.studentId).eq("assignmentId", args.assignmentId)
      )
      .first();

    if (existing) return existing._id;

    // Get org id from student
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new Error("Student not found");

    return await ctx.db.insert("agentConversations", {
      organizationId: student.organizationId,
      studentId: args.studentId,
      assignmentId: args.assignmentId,
      messages: [],
      status: "analyzing",
      deepDiveRequested: false,
      createdAt: Date.now(),
    });
  },
});

export const appendAgentMessage = mutation({
  args: {
    conversationId: v.id("agentConversations"),
    content: v.string(),
    newStatus: v.optional(v.union(v.literal("analyzing"), v.literal("negotiating"), v.literal("searching"), v.literal("active"), v.literal("closed"))),
    inReplyTo: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Internal mutation for backend agents via webhook (no auth guard)
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) throw new Error("Conversation not found");

    if (args.inReplyTo) {
      if (convo.messages.some(m => m.role === "agent" && m.inReplyTo === args.inReplyTo)) {
        return null; // Idempotent return
      }
    }

    const patch: any = {
      messages: [
        ...convo.messages,
        { role: "agent", content: args.content, timestamp: Date.now(), inReplyTo: args.inReplyTo },
      ],
    };
    if (args.newStatus) {
      patch.status = args.newStatus;
    }
    await ctx.db.patch(args.conversationId, patch);
    return null;
  },
});

export const updateStatus = mutation({
  args: {
    conversationId: v.id("agentConversations"),
    status: v.union(v.literal("analyzing"), v.literal("negotiating"), v.literal("searching"), v.literal("active"), v.literal("closed")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) throw new Error("Conversation not found");
    await ctx.db.patch(args.conversationId, { status: args.status });
    return null;
  },
});

export const getConversationInternal = query({
  args: { conversationId: v.id("agentConversations") },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.conversationId);
  },
});

export const markDeepDiveRequested = mutation({
  args: { conversationId: v.id("agentConversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireAuthWithProfile(ctx);
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) throw new Error("Conversation not found");
    requireSameOrganization(convo.organizationId, profile.organizationId);
    await ctx.db.patch(args.conversationId, { deepDiveRequested: true });
    return null;
  },
});

// -------------------------------------------------------------------
// Main action: raw post-assignment chat capture only
// -------------------------------------------------------------------
export const startAnalysis = action({
  args: { assignmentId: v.id("assignments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuthFromAction(ctx);

    // REMOVED: performance analysis and weak-topic extraction — see Agent 2
    await ctx.runMutation(api.agentConversation.createConversation, {
      assignmentId: args.assignmentId,
      initialMessage:
        "Your session data is recorded. A performance summary will appear once Agent 2 finishes the analysis.",
      weakTopics: [],
    });

    return null;
  },
});

export const sendMessage = action({
  args: {
    conversationId: v.id("agentConversations"),
    assignmentId: v.id("assignments"),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAuthFromAction(ctx);

    // 1. Save student message
    await ctx.runMutation(api.agentConversation.appendMessage, {
      conversationId: args.conversationId,
      role: "student",
      content: args.message,
    });

    return null;
  },
});
