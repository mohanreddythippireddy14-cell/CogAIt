import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireAuthWithProfile } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";
import { isGradedSubmission } from "./application/attemptService";
import { computeCisPerQuestion, computeOverallCis } from "./domain/scoring";

const attemptValidator = v.object({
  _id: v.id("attempts"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  studentId: v.id("users"),
  assignmentId: v.id("assignments"),
  questionId: v.id("questions"),
  startedAt: v.number(),
  submittedAt: v.optional(v.number()),
  timeSpentBeforeFirstHelp: v.optional(v.number()),
  studentAnswer: v.optional(v.string()),
  studentReasoning: v.optional(v.string()),
  reasoningTextSnapshot: v.optional(v.string()),
  reasoningCharCountBeforeFirstHelp: v.optional(v.number()),
  firstHelpRequestedAt: v.optional(v.number()),
  questionStatus: v.optional(
    v.union(
      v.literal("unattempted"),
      v.literal("answered"),
      v.literal("skipped"),
      v.literal("review"),
    ),
  ),
  markedForReview: v.optional(v.boolean()),
  isCorrect: v.optional(v.boolean()),
  totalHelpRequests: v.number(),
  helpLevelsUsed: v.array(v.number()),
  retryCount: v.number(),
  copyPasteDetected: v.boolean(),
  answerBeforeReasoning: v.boolean(),
  independenceScore: v.optional(v.number()),
  cognitiveScore: v.optional(v.number()),
});

async function createAttemptRecord(
  ctx: MutationCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
  assignmentId: Id<"assignments">,
  questionId: Id<"questions">,
) {
  const assignment = await ctx.db.get(assignmentId);
  if (!assignment) {
    throw new Error("Assignment not found");
  }
  if (!assignment.organizationId) {
    throw new Error("Assignment organization is missing. Run legacy backfill.");
  }
  requireSameOrganization(assignment.organizationId, organizationId);

  const existing = await ctx.db
    .query("attempts")
    .withIndex("by_org_assignment_student", (q) =>
      q.eq("organizationId", organizationId).eq("assignmentId", assignmentId).eq("studentId", userId),
    )
    .collect()
    .then((rows) => rows.find((row) => row.questionId === questionId));

  if (existing && existing.assignmentId === assignmentId) {
    await ctx.runMutation(api.sessionLocks.startSession, {
      assignmentId,
    });
    return existing._id;
  }

  const attemptId = await ctx.db.insert("attempts", {
    organizationId,
    studentId: userId,
    assignmentId,
    questionId,
    startedAt: Date.now(),
    totalHelpRequests: 0,
    helpLevelsUsed: [],
    retryCount: 0,
    copyPasteDetected: false,
    answerBeforeReasoning: false,
    questionStatus: "unattempted",
    markedForReview: false,
  });

  await ctx.runMutation(api.sessionLocks.startSession, {
    assignmentId,
  });
  await ctx.runMutation(api.attempts.resumeAssignmentTimer, {
    assignmentId,
  });
  return attemptId;
}

async function getOrCreateAssignmentProgress(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  studentId: Id<"users">,
  assignmentId: Id<"assignments">,
) {
  const existing = await ctx.db
    .query("assignmentProgress")
    .withIndex("by_org_assignment_student", (q) =>
      q.eq("organizationId", organizationId).eq("assignmentId", assignmentId).eq("studentId", studentId),
    )
    .first();
  if (existing) {
    return existing;
  }
  const now = Date.now();
  const id = await ctx.db.insert("assignmentProgress", {
    organizationId,
    studentId,
    assignmentId,
    activeTimeMs: 0,
    sessionStartedAt: undefined,
    submittedAt: undefined,
    lastUpdatedAt: now,
  });
  const created = await ctx.db.get(id);
  if (!created) {
    throw new Error("Failed to initialize assignment progress.");
  }
  return created;
}

async function maybeCalculateFinalScores(
  ctx: MutationCtx,
  studentId: Id<"users">,
  assignmentId: Id<"assignments">,
): Promise<number | null> {
  const assignment = await ctx.db.get(assignmentId);
  if (!assignment) {
    throw new Error("Assignment not found");
  }
  if (!assignment.organizationId) {
    throw new Error("Assignment organization is missing. Run legacy backfill.");
  }
  const assignmentOrganizationId = assignment.organizationId;

  const attempts = await ctx.db
    .query("attempts")
    .withIndex("by_org_assignment_student", (q) =>
      q.eq("organizationId", assignmentOrganizationId).eq("assignmentId", assignmentId).eq("studentId", studentId),
    )
    .collect();

  const submittedAttempts = attempts.filter(
    (attempt) => isGradedSubmission(attempt),
  );
  const assignmentCompleted =
    assignment.totalQuestions > 0 &&
    submittedAttempts.length >= assignment.totalQuestions;

  if (!assignmentCompleted) {
    return null;
  }

  const finalIndependenceScore = await ctx.runMutation(
    internal.calculations.independence.calculateFinalIndependenceScore,
    {
      studentId,
      assignmentId,
    },
  );

  await Promise.all(
    submittedAttempts.map((attempt) =>
        ctx.runMutation(
        internal.calculations.cognitiveScore.calculateAndPatchCognitiveScore,
        {
        attemptId: attempt._id,
        },
      ),
    ),
  );

  await ctx.runMutation(api.sessionLocks.endSession, {
    assignmentId,
  });

  return finalIndependenceScore;
}

async function triggerRollupRecompute(
  ctx: MutationCtx,
  assignmentId: Id<"assignments">,
) {
  await ctx.runMutation((internal as any).dashboardRollups.recomputeAssignmentRollups, {
    assignmentId,
  });
}

export const createAttempt = mutation({
  args: {
    assignmentId: v.id("assignments"),
    questionId: v.id("questions"),
  },
  returns: v.id("attempts"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    return createAttemptRecord(ctx, userId, profile.organizationId, args.assignmentId, args.questionId);
  },
});

export const startAttempt = mutation({
  args: {
    assignmentId: v.id("assignments"),
    questionId: v.id("questions"),
  },
  returns: v.id("attempts"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    return createAttemptRecord(ctx, userId, profile.organizationId, args.assignmentId, args.questionId);
  },
});

export const saveAttemptDraft = mutation({
  args: {
    attemptId: v.id("attempts"),
    studentReasoning: v.optional(v.string()),
    studentAnswer: v.optional(v.string()),
    questionStatus: v.optional(
      v.union(
        v.literal("unattempted"),
        v.literal("answered"),
        v.literal("skipped"),
        v.literal("review"),
      ),
    ),
    markedForReview: v.optional(v.boolean()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Attempt not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);

    const patch: {
      studentReasoning?: string;
      studentAnswer?: string;
      questionStatus?: "unattempted" | "answered" | "skipped" | "review";
      markedForReview?: boolean;
    } = {};
    if (args.studentReasoning !== undefined) {
      patch.studentReasoning = args.studentReasoning;
    }
    if (args.studentAnswer !== undefined) {
      patch.studentAnswer = args.studentAnswer;
    }
    if (args.questionStatus !== undefined) {
      patch.questionStatus = args.questionStatus;
    }
    if (args.markedForReview !== undefined) {
      patch.markedForReview = args.markedForReview;
    }

    await ctx.db.patch(args.attemptId, patch);

    return true;
  },
});

export const redoAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_assignment_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId).eq("studentId", userId),
      )
      .collect();

    const progress = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_assignment_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId).eq("studentId", userId),
      )
      .first();

    await Promise.all(
      attempts.map((attempt) =>
        ctx.db.patch(attempt._id, {
          studentAnswer: undefined,
          submittedAt: undefined,
          studentReasoning: undefined,
          reasoningTextSnapshot: undefined,
          questionStatus: "unattempted",
          markedForReview: false,
          totalHelpRequests: 0,
          helpLevelsUsed: [],
          copyPasteDetected: false,
          independenceScore: undefined,
          cognitiveScore: undefined,
          reasoningCharCountBeforeFirstHelp: undefined,
          timeSpentBeforeFirstHelp: undefined,
          firstHelpRequestedAt: undefined,
          answerBeforeReasoning: false,
          retryCount: attempt.retryCount + 1,
        }),
      ),
    );

    if (progress) {
      await ctx.db.patch(progress._id, {
        submittedAt: undefined,
        activeTimeMs: 0,
        sessionStartedAt: undefined,
        lastUpdatedAt: Date.now(),
      });
    }

    await triggerRollupRecompute(ctx, args.assignmentId);
    return true;
  },
});

export const submitAttempt = mutation({
  args: {
    attemptId: v.id("attempts"),
    studentReasoning: v.optional(v.string()),
    studentAnswer: v.string(),
  },
  returns: v.object({
    submittedAt: v.number(),
    finalIndependenceScore: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Attempt not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);

    const submittedAt = Date.now();
    const question = await ctx.db.get(attempt.questionId);
    if (!question) {
      throw new Error("Question not found");
    }
    const normalizeAnswer = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
    const answer = args.studentAnswer.trim();
    const questionAny = question as typeof question & { correctOption?: "A" | "B" | "C" | "D" };
    const normalizedAnswer = answer.toUpperCase();
    const isCorrect =
      questionAny.correctOption
        ? normalizedAnswer === questionAny.correctOption
        : question.correctAnswer && question.correctAnswer.trim().length > 0
          ? normalizeAnswer(answer) === normalizeAnswer(question.correctAnswer)
          : undefined;
    const patch: {
      studentAnswer: string;
      submittedAt: number;
      isCorrect?: boolean;
      studentReasoning?: string;
      questionStatus?: "answered";
    } = {
      studentAnswer: answer,
      submittedAt,
      questionStatus: "answered",
    };
    if (isCorrect !== undefined) {
      patch.isCorrect = isCorrect;
    }
    if (args.studentReasoning !== undefined) {
      patch.studentReasoning = args.studentReasoning;
    }
    await ctx.db.patch(args.attemptId, patch);

    const finalIndependenceScore = await maybeCalculateFinalScores(
      ctx,
      userId,
      attempt.assignmentId,
    );
    if (finalIndependenceScore !== null) {
      const progress = await getOrCreateAssignmentProgress(
        ctx,
        profile.organizationId,
        userId,
        attempt.assignmentId,
      );
      const now = Date.now();
      const sessionDelta = progress.sessionStartedAt ? Math.max(0, now - progress.sessionStartedAt) : 0;
      await ctx.db.patch(progress._id, {
        activeTimeMs: progress.activeTimeMs + sessionDelta,
        sessionStartedAt: undefined,
        submittedAt: now,
        lastUpdatedAt: now,
      });
    }

    await ctx.runMutation(
      internal.calculations.cognitiveScore.calculateAndPatchCognitiveScore,
      {
        attemptId: attempt._id,
      },
    );
    await ctx.runMutation((api as any)["calculations/dependencyAlerts"].checkAndCreateAlerts, {
      studentId: userId,
      assignmentId: attempt.assignmentId,
    });
    await triggerRollupRecompute(ctx, attempt.assignmentId);

    return {
      submittedAt,
      finalIndependenceScore,
    };
  },
});

export const autoSubmitAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    autoSubmittedCount: v.number(),
    finalIndependenceScore: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_assignment_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId).eq("studentId", userId),
      )
      .collect();

    const now = Date.now();
    const toSubmit = attempts.filter(
      (attempt) =>
        attempt.submittedAt === undefined &&
        isGradedSubmission({ submittedAt: now, studentAnswer: attempt.studentAnswer }),
    );
    await Promise.all(
      toSubmit.map((attempt) =>
        ctx.db.patch(attempt._id, {
          submittedAt: now,
          questionStatus: (attempt.studentAnswer ?? "").trim().length > 0 ? "answered" : "skipped",
        }),
      ),
    );

    const progress = await getOrCreateAssignmentProgress(
      ctx,
      profile.organizationId,
      userId,
      args.assignmentId,
    );
    const sessionDelta = progress.sessionStartedAt ? Math.max(0, now - progress.sessionStartedAt) : 0;
    await ctx.db.patch(progress._id, {
      activeTimeMs: progress.activeTimeMs + sessionDelta,
      sessionStartedAt: undefined,
      submittedAt: now,
      lastUpdatedAt: now,
    });

    const finalIndependenceScore = await maybeCalculateFinalScores(ctx, userId, args.assignmentId);

    await Promise.all(
      attempts.map((attempt) =>
        ctx.runMutation(
          internal.calculations.cognitiveScore.calculateAndPatchCognitiveScore,
          {
            attemptId: attempt._id,
          },
        ),
      ),
    );
    await ctx.runMutation((api as any)["calculations/dependencyAlerts"].checkAndCreateAlerts, {
      studentId: userId,
      assignmentId: args.assignmentId,
    });
    await triggerRollupRecompute(ctx, args.assignmentId);

    return {
      autoSubmittedCount: toSubmit.length,
      finalIndependenceScore,
    };
  },
});

export const resumeAssignmentTimer = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const progress = await getOrCreateAssignmentProgress(
      ctx,
      profile.organizationId,
      userId,
      args.assignmentId,
    );
    if (progress.submittedAt) {
      return true;
    }
    if (progress.sessionStartedAt) {
      return true;
    }
    await ctx.db.patch(progress._id, {
      sessionStartedAt: Date.now(),
      lastUpdatedAt: Date.now(),
    });
    await triggerRollupRecompute(ctx, args.assignmentId);
    return true;
  },
});

export const pauseAssignmentTimer = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const progress = await getOrCreateAssignmentProgress(
      ctx,
      profile.organizationId,
      userId,
      args.assignmentId,
    );
    if (!progress.sessionStartedAt) {
      return true;
    }
    const now = Date.now();
    await ctx.db.patch(progress._id, {
      activeTimeMs: progress.activeTimeMs + Math.max(0, now - progress.sessionStartedAt),
      sessionStartedAt: undefined,
      lastUpdatedAt: now,
    });
    await triggerRollupRecompute(ctx, args.assignmentId);
    return true;
  },
});

export const getAssignmentProgress = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.union(
    v.object({
      activeTimeMs: v.number(),
      sessionStartedAt: v.optional(v.number()),
      submittedAt: v.optional(v.number()),
      isRunning: v.boolean(),
      overtimeSeconds: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);

    const progress = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_assignment_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId).eq("studentId", userId),
      )
      .first();
    if (!progress) {
      return null;
    }
    const now = Date.now();
    const runningDelta = progress.sessionStartedAt ? Math.max(0, now - progress.sessionStartedAt) : 0;
    const totalMs = progress.activeTimeMs + runningDelta;
    const overtimeSeconds = Math.max(0, Math.floor(totalMs / 1000) - assignment.timeLimitMinutes * 60);
    return {
      activeTimeMs: progress.activeTimeMs,
      sessionStartedAt: progress.sessionStartedAt,
      submittedAt: progress.submittedAt,
      isRunning: Boolean(progress.sessionStartedAt),
      overtimeSeconds,
    };
  },
});

export const getStudentDecisionBar = query({
  args: {},
  returns: v.object({
    activeAssignmentTitle: v.union(v.string(), v.null()),
    remainingSeconds: v.union(v.number(), v.null()),
    independenceScore: v.number(),
    riskLevel: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    highAiUsage: v.boolean(),
  }),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "student") {
      throw new Error("Only students can access this view.");
    }

    const progresses = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId),
      )
      .collect();
    const activeProgress = progresses
      .filter((row) => !row.submittedAt)
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)[0] ?? null;

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId),
      )
      .collect();
    const scoredAttempts = attempts.filter((attempt) => attempt.submittedAt && attempt.independenceScore !== undefined);
    const independenceScore = scoredAttempts.length > 0
      ? Math.round(scoredAttempts.reduce((sum, attempt) => sum + (attempt.independenceScore ?? 0), 0) / scoredAttempts.length)
      : 0;

    const avgHelpPerCompleted = scoredAttempts.length > 0
      ? scoredAttempts.reduce((sum, attempt) => sum + attempt.totalHelpRequests, 0) / scoredAttempts.length
      : 0;
    const highAiUsage = avgHelpPerCompleted >= 2.5;

    let riskLevel: "low" | "medium" | "high" = "low";
    if (independenceScore < 40 || avgHelpPerCompleted >= 3.5) {
      riskLevel = "high";
    } else if (independenceScore < 60 || avgHelpPerCompleted >= 2) {
      riskLevel = "medium";
    }

    let finalActiveAssignmentTitle: string | null = null;
    let finalRemainingSeconds: number | null = null;

    if (activeProgress) {
      const assignment = await ctx.db.get(activeProgress.assignmentId);
      if (assignment && assignment.isActive) {
        // We only enforce organization match if the assignment actually exists
        requireSameOrganization(assignment.organizationId, profile.organizationId);
        finalActiveAssignmentTitle = assignment.title;
        const now = Date.now();
        const runningDelta = activeProgress.sessionStartedAt
          ? Math.max(0, now - activeProgress.sessionStartedAt)
          : 0;
        const elapsedSeconds = Math.floor((activeProgress.activeTimeMs + runningDelta) / 1000);
        finalRemainingSeconds = assignment.timeLimitMinutes * 60 - elapsedSeconds;
      }
    }

    if (!finalActiveAssignmentTitle) {
      // Fallback: If no progress currently ticking, show the next available active assignment
      const classEnrollments = await ctx.db
        .query("classEnrollments")
        .withIndex("by_org_and_student", (q) =>
          q.eq("organizationId", profile.organizationId).eq("studentId", userId),
        )
        .collect();
      const enrolledClassroomIds = new Set(classEnrollments.map((row) => row.classroomId.toString()));

      const allActiveAssignments = await ctx.db
        .query("assignments")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
        .collect();

      const visibleUnfinished = allActiveAssignments.filter((a) => {
        if (!a.isActive || a.totalQuestions === 0) return false;
        if (a.classroomId && !enrolledClassroomIds.has(a.classroomId.toString())) return false;
        const p = progresses.find((p) => p.assignmentId === a._id);
        return !p || !p.submittedAt;
      });

      if (visibleUnfinished.length > 0) {
        // Sort by creation time (newest first or oldest first... newest is usually best)
        visibleUnfinished.sort((a, b) => b._creationTime - a._creationTime);
        finalActiveAssignmentTitle = visibleUnfinished[0].title;
      }
    }

    return {
      activeAssignmentTitle: finalActiveAssignmentTitle,
      remainingSeconds: finalRemainingSeconds,
      independenceScore,
      riskLevel,
      highAiUsage,
    };
  },
});

export const getStudentCognitiveTimeline = query({
  args: {},
  returns: v.array(
    v.object({
      assignmentId: v.id("assignments"),
      title: v.string(),
      status: v.union(v.literal("not_started"), v.literal("in_progress"), v.literal("submitted")),
      activeMinutes: v.number(),
      helpRequests: v.number(),
      completedQuestions: v.number(),
      totalQuestions: v.number(),
      lastActivityAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "student") {
      throw new Error("Only students can access this view.");
    }

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const assignmentMap = new Map(assignments.map((assignment) => [assignment._id.toString(), assignment]));

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId),
      )
      .collect();
    const progressRows = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId),
      )
      .collect();
    const progressByAssignment = new Map(progressRows.map((row) => [row.assignmentId.toString(), row]));

    const timeline = Array.from(
      attempts.reduce((acc, attempt) => {
        const key = attempt.assignmentId.toString();
        const bucket = acc.get(key) ?? [];
        bucket.push(attempt);
        acc.set(key, bucket);
        return acc;
      }, new Map<string, typeof attempts>()),
    )
      .map(([assignmentKey, rows]) => {
        const assignment = assignmentMap.get(assignmentKey);
        if (!assignment) {
          return null;
        }
        const progress = progressByAssignment.get(assignmentKey);
        const completedQuestions = rows.filter(
          (row) => row.submittedAt && (row.studentAnswer ?? "").trim().length > 0,
        ).length;
        const helpRequests = rows.reduce((sum, row) => sum + row.totalHelpRequests, 0);
        const activeMinutes = Math.round(((progress?.activeTimeMs ?? 0) / 1000 / 60) * 10) / 10;
        const status: "not_started" | "in_progress" | "submitted" = progress?.submittedAt
          ? "submitted"
          : completedQuestions > 0
            ? "in_progress"
            : "not_started";
        const lastActivityAt = progress?.lastUpdatedAt ?? Math.max(...rows.map((row) => row._creationTime));
        return {
          assignmentId: assignment._id,
          title: assignment.title,
          status,
          activeMinutes,
          helpRequests,
          completedQuestions,
          totalQuestions: assignment.totalQuestions,
          lastActivityAt,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    return timeline.slice(0, 8);
  },
});

export const getAttempt = query({
  args: {
    attemptId: v.id("attempts"),
  },
  returns: attemptValidator,
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Attempt not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);

    return attempt;
  },
});

export const getAttemptsByAssignment = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(attemptValidator),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    return await ctx.db
      .query("attempts")
      .withIndex("by_org_assignment_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId).eq("studentId", userId),
      )
      .collect();
  },
});

export const getResultsReport = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    assignmentTitle: v.string(),
    totalQuestions: v.number(),
    attemptedQuestions: v.number(),
    completedQuestions: v.number(),
    totalHelpRequests: v.number(),
    overallCis: v.number(),
    overtimeSeconds: v.number(),
    perQuestion: v.array(
      v.object({
        questionId: v.id("questions"),
        questionNumber: v.number(),
        subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
        topic: v.string(),
        subtopic: v.optional(v.string()),
        result: v.union(v.literal("completed"), v.literal("not_attempted")),
        timeSpentSeconds: v.optional(v.number()),
        helpRequests: v.number(),
        helpLevelsUsed: v.array(v.number()),
        independenceScore: v.optional(v.number()),
        cisScore: v.number(),
      }),
    ),
    heatmap: v.array(
      v.object({
        subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
        topic: v.string(),
        subtopic: v.optional(v.string()),
        attemptedCount: v.number(),
        avgCis: v.number(),
        avgIndependence: v.number(),
        avgHelpRequests: v.number(),
        dependencyPercent: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_assignment_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId).eq("studentId", userId),
      )
      .collect();

    const progress = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_assignment_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId).eq("studentId", userId),
      )
      .first();

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .order("asc")
      .collect();
    const attemptByQuestionId = new Map(attempts.map((attempt) => [attempt.questionId.toString(), attempt]));

    const perQuestion = questions.map((question) => {
      const attempt = attemptByQuestionId.get(question._id.toString());
      const completed = Boolean(attempt?.submittedAt && (attempt.studentAnswer ?? "").trim().length > 0);
      const cisScore = attempt
        ? Math.round(
          computeCisPerQuestion({
            totalHelpRequests: attempt.totalHelpRequests,
            helpLevelsUsed: attempt.helpLevelsUsed,
            reasoningCharCountBeforeFirstHelp: attempt.reasoningCharCountBeforeFirstHelp,
            fallbackReasoningLength: attempt.studentReasoning?.length ?? 0,
          }),
        )
        : 0;
      const timeSpentSeconds = attempt?.submittedAt
        ? Math.max(0, Math.floor((attempt.submittedAt - attempt.startedAt) / 1000))
        : undefined;
      return {
        questionId: question._id,
        questionNumber: question.questionNumber,
        subject: question.subject,
        topic: question.topic,
        subtopic: question.subtopic,
        result: completed ? "completed" as const : "not_attempted" as const,
        timeSpentSeconds,
        helpRequests: attempt?.totalHelpRequests ?? 0,
        helpLevelsUsed: attempt?.helpLevelsUsed ?? [],
        independenceScore: attempt?.independenceScore,
        cisScore,
      };
    });

    const attemptedQuestions = attempts.filter((a) => (a.studentAnswer ?? "").trim().length > 0).length;
    const completedQuestions = attempts.filter((a) => a.submittedAt && (a.studentAnswer ?? "").trim().length > 0).length;
    const totalHelpRequests = attempts.reduce((sum, attempt) => sum + attempt.totalHelpRequests, 0);
    const overallCis = computeOverallCis(attempts);

    const topicAgg = new Map<string, {
      subject: "Physics" | "Chemistry" | "Math";
      topic: string;
      subtopic?: string;
      attemptedCount: number;
      cisTotal: number;
      independenceTotal: number;
      independenceCount: number;
      helpTotal: number;
      dependencyCount: number;
    }>();

    for (const row of perQuestion) {
      const key = `${row.subject}::${row.topic}::${row.subtopic ?? ""}`;
      const existing = topicAgg.get(key) ?? {
        subject: row.subject,
        topic: row.topic,
        subtopic: row.subtopic,
        attemptedCount: 0,
        cisTotal: 0,
        independenceTotal: 0,
        independenceCount: 0,
        helpTotal: 0,
        dependencyCount: 0,
      };
      if (row.result === "completed") {
        existing.attemptedCount += 1;
      }
      existing.cisTotal += row.cisScore;
      existing.helpTotal += row.helpRequests;
      if ((row.helpRequests ?? 0) > 0) {
        existing.dependencyCount += 1;
      }
      if (row.independenceScore !== undefined) {
        existing.independenceTotal += row.independenceScore;
        existing.independenceCount += 1;
      }
      topicAgg.set(key, existing);
    }

    const heatmap = Array.from(topicAgg.values()).map((cell) => {
      const denominator = Math.max(1, cell.attemptedCount);
      return {
        subject: cell.subject,
        topic: cell.topic,
        subtopic: cell.subtopic,
        attemptedCount: cell.attemptedCount,
        avgCis: Math.round(cell.cisTotal / denominator),
        avgIndependence: cell.independenceCount > 0 ? Math.round(cell.independenceTotal / cell.independenceCount) : 0,
        avgHelpRequests: Math.round((cell.helpTotal / denominator) * 10) / 10,
        dependencyPercent: Math.round((cell.dependencyCount / denominator) * 100),
      };
    });

    return {
      assignmentTitle: assignment.title,
      totalQuestions: assignment.totalQuestions,
      attemptedQuestions,
      completedQuestions,
      totalHelpRequests,
      overallCis,
      overtimeSeconds: progress?.submittedAt
        ? Math.max(0, Math.round((progress?.activeTimeMs ?? 0) / 1000 - assignment.timeLimitMinutes * 60))
        : 0,
      perQuestion,
      heatmap,
    };
  },
});

export const updateHelpStats = mutation({
  args: {
    attemptId: v.id("attempts"),
    helpLevel: v.number(),
    reasoningChars: v.optional(v.number()),
    reasoningTextSnapshot: v.optional(v.string()),
  },
  returns: v.object({
    totalRequests: v.number(),
    timeSpentBeforeFirstHelp: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);

    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Attempt not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);

    const isFirstHelp = attempt.totalHelpRequests === 0;
    const patch: {
      totalHelpRequests: number;
      helpLevelsUsed: number[];
      timeSpentBeforeFirstHelp?: number;
      reasoningCharCountBeforeFirstHelp?: number;
      reasoningTextSnapshot?: string;
      firstHelpRequestedAt?: number;
    } = {
      totalHelpRequests: attempt.totalHelpRequests + 1,
      helpLevelsUsed: [...attempt.helpLevelsUsed, args.helpLevel],
    };
    if (isFirstHelp) {
      const firstHelpAt = Date.now();
      patch.timeSpentBeforeFirstHelp = Date.now() - attempt.startedAt;
      patch.firstHelpRequestedAt = firstHelpAt;
      patch.reasoningCharCountBeforeFirstHelp = Math.max(
        0,
        Math.floor(args.reasoningChars ?? attempt.studentReasoning?.length ?? 0),
      );
      patch.reasoningTextSnapshot = args.reasoningTextSnapshot ?? attempt.studentReasoning;
    }

    await ctx.db.patch(args.attemptId, patch);
    await triggerRollupRecompute(ctx, attempt.assignmentId);

    return {
      totalRequests: attempt.totalHelpRequests + 1,
      timeSpentBeforeFirstHelp: patch.timeSpentBeforeFirstHelp ?? null,
    };
  },
});

export const recordViolation = mutation({
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
    warning: v.optional(
      v.object({
        type: v.string(),
        timestamp: v.number(),
        details: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<{
    violationCount: number;
    tabSwitchCount: number;
    copyPasteAttempts: number;
    shouldAutoSubmit: boolean;
    warning?: {
      type: string;
      timestamp: number;
      details: string;
    };
  }> => {
    const result = (await ctx.runMutation(api.sessionLocks.logViolation, args)) as {
      violationCount: number;
      tabSwitchCount: number;
      copyPasteAttempts: number;
      shouldAutoSubmit: boolean;
      warning?: {
        type: string;
        timestamp: number;
        details: string;
      };
    };
    await triggerRollupRecompute(ctx, args.assignmentId);
    return result;
  },
});

export const updateHeartbeat = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    return (await ctx.runMutation(api.sessionLocks.updateHeartbeat, args)) as boolean;
  },
});
