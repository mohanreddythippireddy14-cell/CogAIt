import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { agentKeyArg, requireAgentKey } from "./lib/agentAuth";
import { computeCisPerQuestion } from "./domain/scoring";

/**
 * Agent API
 * Endpoints the agent services (agents/src/memory/convex_client.ts) call through
 * ConvexHttpClient. Every function requires the shared agent key (see lib/agentAuth.ts).
 */

const historyEntryValidator = v.object({
  assignmentId: v.id("assignments"),
  submittedAt: v.number(),
  subject: v.string(),
  topic: v.string(),
  totalHelpRequests: v.number(),
  maxHelpLevel: v.number(),
  isCorrect: v.optional(v.boolean()),
  cis: v.number(),
});

/**
 * Submitted attempts of one student (most recent first, up to 500), with the per-question
 * CIS computed by the same CIS_v1 formula the results page uses.
 */
export const getStudentHistory = query({
  args: { ...agentKeyArg, studentId: v.id("users") },
  returns: v.array(historyEntryValidator),
  handler: async (ctx, args) => {
    requireAgentKey(args.agentKey);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.studentId))
      .first();
    if (!profile) return [];

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", args.studentId),
      )
      .order("desc")
      .take(500);

    const history = [];
    for (const attempt of attempts) {
      if (attempt.submittedAt === undefined) continue;
      const question = await ctx.db.get(attempt.questionId);
      history.push({
        assignmentId: attempt.assignmentId,
        submittedAt: attempt.submittedAt,
        subject: question?.subject ?? "Unknown",
        topic: question?.topic ?? "Unknown",
        totalHelpRequests: attempt.totalHelpRequests,
        maxHelpLevel: attempt.helpLevelsUsed.length > 0 ? Math.max(...attempt.helpLevelsUsed) : 0,
        isCorrect: attempt.isCorrect,
        cis:
          (attempt.studentAnswer ?? "").trim().length > 0
            ? computeCisPerQuestion({
                totalHelpRequests: attempt.totalHelpRequests,
                helpLevelsUsed: attempt.helpLevelsUsed,
                reasoningCharCountBeforeFirstHelp: attempt.reasoningCharCountBeforeFirstHelp,
                fallbackReasoningLength: attempt.studentReasoning?.length ?? 0,
              })
            : 0,
      });
    }
    return history;
  },
});

/**
 * Who owns an assignment (used by Agent 6 to route the cohort report to the lecturer).
 */
export const getAssignmentContext = query({
  args: { ...agentKeyArg, assignmentId: v.id("assignments") },
  returns: v.union(
    v.object({
      assignmentId: v.id("assignments"),
      lecturerId: v.id("users"),
      title: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    requireAgentKey(args.agentKey);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) return null;
    return { assignmentId: assignment._id, lecturerId: assignment.lecturerId, title: assignment.title };
  },
});

const subjectValidator = v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"));

/**
 * Stores questions extracted by Agent 5 as an unpublished draft assignment the lecturer can
 * review in the dashboard (isActive=false, aiProcessingStatus="review_ready").
 */
export const createDraftAssignment = mutation({
  args: {
    ...agentKeyArg,
    lecturerId: v.id("users"),
    title: v.string(),
    defaultSubject: subjectValidator,
    questions: v.array(
      v.object({
        text: v.string(),
        options: v.optional(v.array(v.string())),
        correctAnswer: v.optional(v.string()),
        topic: v.string(),
        subject: v.optional(subjectValidator),
      }),
    ),
  },
  returns: v.id("assignments"),
  handler: async (ctx, args) => {
    requireAgentKey(args.agentKey);
    if (args.questions.length === 0) {
      throw new Error("No questions to store");
    }
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.lecturerId))
      .first();
    if (!profile || (profile.role !== "lecturer" && profile.role !== "organizationAdmin")) {
      throw new Error("Lecturer profile not found");
    }

    const assignmentId = await ctx.db.insert("assignments", {
      organizationId: profile.organizationId,
      lecturerId: args.lecturerId,
      title: args.title.trim() || "Imported assignment",
      timeLimitMinutes: Math.max(10, args.questions.length * 4),
      totalQuestions: args.questions.length,
      minReasoningChars: 30,
      isActive: false,
      aiProcessingStatus: "review_ready",
    });

    for (const [index, question] of args.questions.entries()) {
      const options = question.options && question.options.length >= 2 ? question.options.slice(0, 4) : undefined;
      await ctx.db.insert("questions", {
        assignmentId,
        questionNumber: index + 1,
        questionText: question.text,
        questionType: options ? "mcq" : "numerical",
        mcqOptions: options,
        subject: question.subject ?? args.defaultSubject,
        topic: question.topic,
        difficulty: "medium",
        correctAnswer: question.correctAnswer,
        generationMethod: "agent5_ingestion",
        reviewed: false,
      });
    }
    return assignmentId;
  },
});
