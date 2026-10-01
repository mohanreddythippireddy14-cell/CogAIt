import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuthWithProfile } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";
import { buildOrgCacheKey, getCacheValue, setCacheValue } from "./infrastructure/cache";
import { isFeatureEnabled } from "./infrastructure/featureFlags";
import {
  contentBlockValidator,
  normalizeLegacyQuestionToBlocks,
  validateContentBlocks,
} from "./domain/contentBlocks";

function buildQuestionContentBlocks(
  questionText: string,
  providedBlocks?: ReturnType<typeof normalizeLegacyQuestionToBlocks>,
) {
  const fallbackBlocks = normalizeLegacyQuestionToBlocks(questionText);
  const normalizedBlocks = providedBlocks ?? fallbackBlocks;
  const validation = validateContentBlocks(normalizedBlocks);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  return normalizedBlocks;
}

async function requireFacultyInOrganization(ctx: any) {
  const { userId, profile } = await requireAuthWithProfile(ctx);
  if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
    throw new Error("Only lecturers can perform this action");
  }
  return { userId, organizationId: profile.organizationId };
}

export const createAssignment = mutation({
  args: {
    title: v.string(),
    subject: v.optional(v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"))),
    chapter: v.optional(v.string()),
    difficulty: v.optional(v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"), v.literal("mixed"))),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    instructions: v.optional(v.string()),
    timeLimitMinutes: v.number(),
    minReasoningChars: v.optional(v.number()),
    allowedLevels: v.optional(v.array(v.number())),
    classroomId: v.id("classrooms"),
  },
  returns: v.id("assignments"),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);
    const classroom = await ctx.db.get(args.classroomId);
    if (!classroom) {
      throw new Error("Selected classroom was not found.");
    }
    requireSameOrganization(classroom.organizationId, organizationId);
    if (classroom.lecturerId !== userId) {
      throw new Error("You can assign only to your own classrooms.");
    }
    const normalizedTitle = args.title.trim();
    if (!normalizedTitle) {
      throw new Error("Assignment title is required.");
    }
    if (/^[a-z0-9]{6,}$/i.test(normalizedTitle)) {
      throw new Error("Assignment title looks like an internal ID. Please use a descriptive title.");
    }

    return await ctx.db.insert("assignments", {
      organizationId,
      lecturerId: userId,
      classroomId: args.classroomId,
      title: normalizedTitle,
      subject: args.subject,
      chapter: args.chapter?.trim() || undefined,
      difficulty: args.difficulty,
      description: args.description,
      dueDate: args.dueDate,
      instructions: args.instructions?.trim() || undefined,
      timeLimitMinutes: args.timeLimitMinutes,
      minReasoningChars: Math.max(0, Math.floor(args.minReasoningChars ?? 30)),
      totalQuestions: 0, // Will be updated when questions are added
      allowedLevels: args.allowedLevels,
      isActive: false, // Draft by default
    });
  },
});

export const addQuestion = mutation({
  args: {
    assignmentId: v.id("assignments"),
    questionNumber: v.number(),
    questionText: v.string(),
    contentBlocks: v.optional(v.array(contentBlockValidator)),
    subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
    topic: v.string(),
    subtopic: v.optional(v.string()),
    difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
    givenVariables: v.optional(v.string()),
    correctAnswer: v.optional(v.string()),
    mcqOptions: v.optional(v.array(v.string())),
    correctOption: v.optional(
      v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("D")),
    ),
    imageId: v.optional(v.id("_storage")),
  },
  returns: v.id("questions"),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    // Verify assignment belongs to lecturer
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    const questionId = await ctx.db.insert("questions", {
      assignmentId: args.assignmentId,
      questionNumber: args.questionNumber,
      questionText: args.questionText,
      contentBlocks: buildQuestionContentBlocks(args.questionText, args.contentBlocks),
      subject: args.subject,
      topic: args.topic,
      subtopic: args.subtopic,
      difficulty: args.difficulty,
      givenVariables: args.givenVariables,
      correctAnswer: args.correctAnswer,
      mcqOptions: args.mcqOptions,
      correctOption: args.correctOption,
      imageId: args.imageId,
    });

    // Update total questions count
    const questionCount = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect()
      .then(questions => questions.length);

    await ctx.db.patch(args.assignmentId, {
      totalQuestions: questionCount,
    });

    return questionId;
  },
});

export const publishAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    assignmentId: v.id("assignments"),
    publishedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    const questionCount = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect()
      .then((rows) => rows.length);
    if (questionCount === 0) {
      throw new Error("Cannot publish assignment with zero questions.");
    }

    const publishedAt = Date.now();
    await ctx.db.patch(args.assignmentId, {
      isActive: true,
      publishedAt,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.sendAssignmentPublishedNotifications,
      {
        assignmentId: args.assignmentId,
        publishedAt,
      },
    );

    return {
      assignmentId: args.assignmentId,
      publishedAt,
    };
  },
});

export const toggleAssignmentActive = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    assignmentId: v.id("assignments"),
    isActive: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    const nextIsActive = !assignment.isActive;
    if (nextIsActive) {
      const questionCount = await ctx.db
        .query("questions")
        .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
        .collect()
        .then((rows) => rows.length);
      if (questionCount === 0) {
        throw new Error("Cannot activate assignment with zero questions.");
      }
    }

    await ctx.db.patch(args.assignmentId, {
      isActive: nextIsActive,
      publishedAt: nextIsActive ? assignment.publishedAt ?? Date.now() : assignment.publishedAt,
    });

    return {
      assignmentId: args.assignmentId,
      isActive: nextIsActive,
    };
  },
});

export const getLecturerAssignmentForEdit = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.union(
    v.object({
      _id: v.id("assignments"),
      title: v.string(),
      subject: v.optional(v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"))),
      chapter: v.optional(v.string()),
      difficulty: v.optional(v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"), v.literal("mixed"))),
      description: v.optional(v.string()),
      dueDate: v.optional(v.number()),
      instructions: v.optional(v.string()),
      timeLimitMinutes: v.number(),
      minReasoningChars: v.number(),
      allowedLevels: v.optional(v.array(v.number())),
      isActive: v.boolean(),
      totalQuestions: v.number(),
      questionCount: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      return null;
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    const questionCount = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect()
      .then((rows) => rows.length);

    return {
      _id: assignment._id,
      title: assignment.title,
      subject: assignment.subject,
      chapter: assignment.chapter,
      difficulty: assignment.difficulty,
      description: assignment.description,
      dueDate: assignment.dueDate,
      instructions: assignment.instructions,
      timeLimitMinutes: assignment.timeLimitMinutes,
      minReasoningChars: assignment.minReasoningChars ?? 30,
      allowedLevels: assignment.allowedLevels,
      isActive: assignment.isActive,
      totalQuestions: assignment.totalQuestions,
      questionCount,
    };
  },
});

export const updateAssignmentBasics = mutation({
  args: {
    assignmentId: v.id("assignments"),
    title: v.string(),
    subject: v.optional(v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"))),
    chapter: v.optional(v.string()),
    difficulty: v.optional(v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"), v.literal("mixed"))),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    instructions: v.optional(v.string()),
    timeLimitMinutes: v.number(),
    minReasoningChars: v.optional(v.number()),
    allowedLevels: v.optional(v.array(v.number())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    const title = args.title.trim();
    if (!title) {
      throw new Error("Title is required.");
    }
    if (/^[a-z0-9]{6,}$/i.test(title)) {
      throw new Error("Assignment title looks like an internal ID. Please use a descriptive title.");
    }
    if (args.allowedLevels && args.allowedLevels.length === 0) {
      throw new Error("Select at least one allowed help level.");
    }

    await ctx.db.patch(args.assignmentId, {
      title,
      subject: args.subject,
      chapter: args.chapter?.trim() || undefined,
      difficulty: args.difficulty,
      description: args.description?.trim() || undefined,
      dueDate: args.dueDate,
      instructions: args.instructions?.trim() || undefined,
      timeLimitMinutes: args.timeLimitMinutes,
      minReasoningChars: Math.max(0, Math.floor(args.minReasoningChars ?? assignment.minReasoningChars ?? 30)),
      allowedLevels: args.allowedLevels,
    });
    return null;
  },
});

export const getLecturerAssignments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("assignments"),
      _creationTime: v.number(),
      organizationId: v.id("organizations"),
      lecturerId: v.id("users"),
      classroomId: v.optional(v.id("classrooms")),
      title: v.string(),
      subject: v.optional(v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"))),
      chapter: v.optional(v.string()),
      difficulty: v.optional(v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"), v.literal("mixed"))),
      description: v.optional(v.string()),
      dueDate: v.optional(v.number()),
      instructions: v.optional(v.string()),
      timeLimitMinutes: v.number(),
      minReasoningChars: v.optional(v.number()),
      totalQuestions: v.number(),
      allowedLevels: v.optional(v.array(v.number())),
      isActive: v.boolean(),
      publishedAt: v.optional(v.number()),
      aiProcessingStatus: v.optional(
        v.union(
          v.literal("processing"),
          v.literal("review_ready"),
          v.literal("completed"),
          v.literal("failed"),
          v.literal("failed_timeout"),
        ),
      ),
      aiProcessingError: v.optional(v.string()),
      aiJobId: v.optional(v.id("facultyAssignmentJobs")),
      targetStudentId: v.optional(v.id("users")),
      isDeepDive: v.optional(v.boolean()),
      sourceAssignmentId: v.optional(v.id("assignments")),
      questionCount: v.number(),
      studentsAttempted: v.number(),
      studentsCompleted: v.number(),
      avgIndependenceScore: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_org_and_lecturer", (q) =>
        q.eq("organizationId", organizationId).eq("lecturerId", userId),
      )
      .order("desc")
      .collect();

    // Get question counts and attempt stats for each assignment
    const assignmentsWithStats = await Promise.all(
      assignments.map(async (assignment) => {
        const questions = await ctx.db
          .query("questions")
          .withIndex("by_assignment", (q) => q.eq("assignmentId", assignment._id))
          .collect();

        const attempts = await ctx.db
          .query("attempts")
          .withIndex("by_assignment", (q) => q.eq("assignmentId", assignment._id))
          .collect();

        const uniqueStudents = new Set(attempts.map(a => a.studentId)).size;
        const completedAttempts = attempts.filter(a => a.submittedAt).length;
        const avgIndependence = attempts.length > 0 
          ? attempts.reduce((sum, a) => sum + (a.independenceScore || 0), 0) / attempts.length
          : 0;

        return {
          ...assignment,
          questionCount: questions.length,
          studentsAttempted: uniqueStudents,
          studentsCompleted: completedAttempts,
          avgIndependenceScore: Math.round(avgIndependence),
        };
      })
    );
    return assignmentsWithStats.filter((assignment) => assignment.isActive || assignment.questionCount > 0);
  },
});

export const getStudentAssignments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("assignments"),
      _creationTime: v.number(),
      organizationId: v.id("organizations"),
      lecturerId: v.id("users"),
      classroomId: v.optional(v.id("classrooms")),
      title: v.string(),
      subject: v.optional(v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"))),
      chapter: v.optional(v.string()),
      difficulty: v.optional(v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"), v.literal("mixed"))),
      description: v.optional(v.string()),
      dueDate: v.optional(v.number()),
      instructions: v.optional(v.string()),
      timeLimitMinutes: v.number(),
      minReasoningChars: v.optional(v.number()),
      totalQuestions: v.number(),
      allowedLevels: v.optional(v.array(v.number())),
      isActive: v.boolean(),
      publishedAt: v.optional(v.number()),
      aiProcessingStatus: v.optional(
        v.union(
          v.literal("processing"),
          v.literal("review_ready"),
          v.literal("completed"),
          v.literal("failed"),
          v.literal("failed_timeout"),
        ),
      ),
      aiProcessingError: v.optional(v.string()),
      aiJobId: v.optional(v.id("facultyAssignmentJobs")),
      targetStudentId: v.optional(v.id("users")),
      isDeepDive: v.optional(v.boolean()),
      sourceAssignmentId: v.optional(v.id("assignments")),
      status: v.union(v.literal("not_started"), v.literal("in_progress"), v.literal("completed")),
      progress: v.number(),
      avgScore: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const cacheKey = buildOrgCacheKey(
      profile.organizationId.toString(),
      "studentAssignments",
      userId.toString(),
    );

    if (isFeatureEnabled("cachingLayer", profile.organizationId)) {
      const cached = getCacheValue<Array<{
        _id: any;
        _creationTime: number;
        organizationId: any;
        lecturerId: any;
        classroomId?: any;
        title: string;
        subject?: "Physics" | "Chemistry" | "Math";
        chapter?: string;
        difficulty?: "easy" | "medium" | "hard" | "mixed";
        description?: string;
        dueDate?: number;
        instructions?: string;
        timeLimitMinutes: number;
        minReasoningChars?: number;
        totalQuestions: number;
        allowedLevels: number[] | undefined;
        isActive: boolean;
        publishedAt?: number;
        aiProcessingStatus?: "processing" | "review_ready" | "completed" | "failed" | "failed_timeout";
        aiProcessingError?: string;
        aiJobId?: any;
        targetStudentId?: any;
        isDeepDive?: boolean;
        sourceAssignmentId?: any;
        status: "not_started" | "in_progress" | "completed";
        progress: number;
        avgScore: number;
      }>>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Get all active assignments
    const activeAssignments = await ctx.db
      .query("assignments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const assignments = activeAssignments
      .filter((assignment) => assignment.totalQuestions > 0 && assignment.isActive)
      .sort((a, b) => b._creationTime - a._creationTime);

    const studentAttempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId),
      )
      .collect();
    const assignmentProgressRows = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId),
      )
      .collect();
    const progressByAssignment = new Map(
      assignmentProgressRows.map((row) => [row.assignmentId.toString(), row]),
    );
    const classEnrollments = await ctx.db
      .query("classEnrollments")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId),
      )
      .collect();
    const enrolledClassroomIds = new Set(classEnrollments.map((row) => row.classroomId.toString()));
    const attemptsByAssignmentId = new Map<string, typeof studentAttempts>();
    for (const attempt of studentAttempts) {
      const key = attempt.assignmentId.toString();
      const existing = attemptsByAssignmentId.get(key);
      if (existing) {
        existing.push(attempt);
      } else {
        attemptsByAssignmentId.set(key, [attempt]);
      }
    }

    const visibleAssignments = assignments.filter(
      (assignment) => {
        // Deep-dive assignments are only visible to the targeted student
        if (assignment.targetStudentId) {
          return assignment.targetStudentId === userId;
        }
        // Regular assignments: must be in an enrolled classroom
        return assignment.classroomId && enrolledClassroomIds.has(assignment.classroomId.toString());
      },
    );

    // Build student assignment progress without per-assignment attempt queries
    const assignmentsWithProgress = await Promise.all(
      visibleAssignments.map(async (assignment) => {
        const attempts = attemptsByAssignmentId.get(assignment._id.toString()) ?? [];

        const completedQuestions = attempts.filter(
          (a) => a.submittedAt && (a.studentAnswer ?? "").trim().length > 0,
        ).length;
        
        let status: "not_started" | "in_progress" | "completed";
        const progressRow = progressByAssignment.get(assignment._id.toString());
        if (progressRow?.submittedAt) {
          status = "completed";
        } else if (completedQuestions === 0) {
          status = "not_started";
        } else if (completedQuestions < assignment.totalQuestions) {
          status = "in_progress";
        } else {
          status = "completed";
        }

        const scoredAttempts = attempts.filter(
          (a) => a.submittedAt && (a.studentAnswer ?? "").trim().length > 0,
        );
        const avgScore = scoredAttempts.length > 0
          ? scoredAttempts.reduce((sum, a) => sum + (a.independenceScore || 0), 0) / scoredAttempts.length
          : 0;

        return {
          ...assignment,
          status,
          progress: completedQuestions,
          avgScore: Math.round(avgScore),
        };
      })
    );

    if (isFeatureEnabled("cachingLayer", profile.organizationId)) {
      setCacheValue(cacheKey, assignmentsWithProgress, 15000);
    }

    return assignmentsWithProgress;
  },
});

export const getAssignmentQuestions = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      _id: v.id("questions"),
      _creationTime: v.number(),
      assignmentId: v.id("assignments"),
      questionNumber: v.number(),
      questionText: v.string(),
      contentBlocks: v.optional(v.array(contentBlockValidator)),
      questionType: v.optional(v.string()),
      mcqOptions: v.optional(v.array(v.string())),
      correctOption: v.optional(
        v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("D")),
      ),
      subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
      topic: v.string(),
      subtopic: v.optional(v.string()),
      difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
      givenVariables: v.optional(v.string()),
      correctAnswer: v.optional(v.string()),
      imageId: v.optional(v.id("_storage")),
      imageUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { profile } = await requireAuthWithProfile(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .order("asc")
      .collect();

    const normalizeSubject = (
      value: string | undefined,
    ): "Physics" | "Chemistry" | "Math" => {
      if (value === "Physics" || value === "Chemistry" || value === "Math") {
        return value;
      }
      return "Physics";
    };

    const normalizeDifficulty = (
      value: string | undefined,
    ): "easy" | "medium" | "hard" => {
      if (value === "easy" || value === "medium" || value === "hard") {
        return value;
      }
      return "medium";
    };

    // Get image URLs for questions that have images
    const questionsWithImages = await Promise.all(
      questions.map(async (question) => {
        const questionAny = question as typeof question & {
          questionType?: string;
          mcqOptions?: string[];
          correctOption?: "A" | "B" | "C" | "D";
        };
        let imageUrl = null;
        if (question.imageId) {
          imageUrl = await ctx.storage.getUrl(question.imageId);
        }
        return {
          _id: question._id,
          _creationTime: question._creationTime,
          assignmentId: question.assignmentId,
          questionNumber: question.questionNumber,
          questionText: question.questionText || "",
          contentBlocks: question.contentBlocks ?? normalizeLegacyQuestionToBlocks(question.questionText || ""),
          questionType: questionAny.questionType,
          mcqOptions: questionAny.mcqOptions,
          correctOption: questionAny.correctOption,
          subject: normalizeSubject(question.subject),
          topic: question.topic || "General",
          subtopic: question.subtopic,
          difficulty: normalizeDifficulty(question.difficulty),
          givenVariables: question.givenVariables,
          correctAnswer: question.correctAnswer,
          imageId: question.imageId,
          imageUrl,
        };
      })
    );

    return questionsWithImages;
  },
});

export const getLecturerAssignmentQuestions = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      _id: v.id("questions"),
      questionNumber: v.number(),
      questionText: v.string(),
      contentBlocks: v.optional(v.array(contentBlockValidator)),
      questionType: v.optional(v.string()),
      mcqOptions: v.optional(v.array(v.string())),
      correctOption: v.optional(
        v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("D")),
      ),
      subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
      topic: v.string(),
      subtopic: v.optional(v.string()),
      difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
      givenVariables: v.optional(v.string()),
      correctAnswer: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    return await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .order("asc")
      .collect()
      .then((rows) => rows.map((q) => {
        const qAny = q as typeof q & {
          questionType?: string;
          mcqOptions?: string[];
          correctOption?: "A" | "B" | "C" | "D";
        };
        return {
          _id: q._id,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          contentBlocks: q.contentBlocks ?? normalizeLegacyQuestionToBlocks(q.questionText || ""),
          questionType: qAny.questionType,
          mcqOptions: qAny.mcqOptions,
          correctOption: qAny.correctOption,
          subject: q.subject,
          topic: q.topic,
          subtopic: q.subtopic,
          difficulty: q.difficulty,
          givenVariables: q.givenVariables,
          correctAnswer: q.correctAnswer,
        };
      }));
  },
});

export const updateLecturerAssignmentQuestion = mutation({
  args: {
    questionId: v.id("questions"),
    questionText: v.string(),
    contentBlocks: v.optional(v.array(contentBlockValidator)),
    questionType: v.optional(v.string()),
    mcqOptions: v.optional(v.array(v.string())),
    correctOption: v.optional(
      v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("D")),
    ),
    subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
    topic: v.string(),
    subtopic: v.optional(v.string()),
    difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
    givenVariables: v.optional(v.string()),
    correctAnswer: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const question = await ctx.db.get(args.questionId);
    if (!question) {
      throw new Error("Question not found");
    }
    const assignment = await ctx.db.get(question.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    await ctx.db.patch(args.questionId, {
      questionText: args.questionText,
      contentBlocks: buildQuestionContentBlocks(args.questionText, args.contentBlocks),
      questionType: args.questionType,
      mcqOptions: args.mcqOptions,
      correctOption: args.correctOption,
      subject: args.subject,
      topic: args.topic,
      subtopic: args.subtopic,
      difficulty: args.difficulty,
      givenVariables: args.givenVariables,
      correctAnswer: args.correctAnswer,
    });
    return null;
  },
});

export const addLecturerAssignmentQuestion = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.id("questions"),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    const count = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect()
      .then((rows) => rows.length);

    const questionId = await ctx.db.insert("questions", {
      assignmentId: args.assignmentId,
      questionNumber: count + 1,
      questionText: "New question",
      contentBlocks: [{ type: "text", value: "New question" }],
      subject: "Physics",
      topic: "General",
      subtopic: undefined,
      difficulty: "medium",
      givenVariables: undefined,
      correctAnswer: undefined,
    });

    await ctx.db.patch(args.assignmentId, {
      totalQuestions: count + 1,
    });

    return questionId;
  },
});

export const deleteLecturerAssignmentQuestion = mutation({
  args: {
    questionId: v.id("questions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const question = await ctx.db.get(args.questionId);
    if (!question) {
      return null;
    }

    const assignment = await ctx.db.get(question.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    await ctx.db.delete(args.questionId);

    const remaining = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", question.assignmentId))
      .order("asc")
      .collect();

    for (let i = 0; i < remaining.length; i += 1) {
      if (remaining[i].questionNumber !== i + 1) {
        await ctx.db.patch(remaining[i]._id, { questionNumber: i + 1 });
      }
    }

    await ctx.db.patch(question.assignmentId, {
      totalQuestions: remaining.length,
    });

    return null;
  },
});

export const deleteAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    deleted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireFacultyInOrganization(ctx);

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }
    requireSameOrganization(assignment.organizationId, organizationId);

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();
    const dependencyAlerts = await ctx.db
      .query("dependencyAlerts")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const sessionLocks = await ctx.db
      .query("sessionLocks")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const aiInteractions = await ctx.db
      .query("aiInteractions")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const aiUsageMetrics = await ctx.db
      .query("aiUsageMetrics")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const promptVersionEvents = await ctx.db
      .query("promptVersionEvents")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const facultyJobs = await ctx.db
      .query("facultyAssignmentJobs")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();

    for (const row of questions) {
      await ctx.db.delete(row._id);
    }
    for (const attempt of attempts) {
      const violations = await ctx.db
        .query("aiViolations")
        .withIndex("by_attempt", (q) => q.eq("attemptId", attempt._id))
        .collect();
      for (const violation of violations) {
        await ctx.db.delete(violation._id);
      }
      await ctx.db.delete(attempt._id);
    }
    for (const row of dependencyAlerts) {
      await ctx.db.delete(row._id);
    }
    for (const row of sessionLocks) {
      await ctx.db.delete(row._id);
    }
    for (const row of aiInteractions) {
      await ctx.db.delete(row._id);
    }
    for (const row of aiUsageMetrics) {
      await ctx.db.delete(row._id);
    }
    for (const row of promptVersionEvents) {
      await ctx.db.delete(row._id);
    }
    for (const row of facultyJobs) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.delete(args.assignmentId);
    return { deleted: true };
  },
});
