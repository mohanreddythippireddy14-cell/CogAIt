"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("convex/server");
const values_1 = require("convex/values");
const server_2 = require("@convex-dev/auth/server");
const applicationTables = {
    organizations: (0, server_1.defineTable)({
        name: values_1.v.string(),
        createdAt: values_1.v.number(),
        createdBy: values_1.v.id("users"),
        planTier: values_1.v.string(),
        isActive: values_1.v.boolean(),
    }).index("by_name", ["name"]),
    // Extended user profile data
    userProfiles: (0, server_1.defineTable)({
        userId: values_1.v.id("users"),
        organizationId: values_1.v.id("organizations"),
        fullName: values_1.v.string(),
        role: values_1.v.union(values_1.v.literal("student"), values_1.v.literal("lecturer"), values_1.v.literal("organizationAdmin")),
        institution: values_1.v.optional(values_1.v.string()),
    }).index("by_user", ["userId"])
        .index("by_organizationId", ["organizationId"]),
    // Assignments created by lecturers
    assignments: (0, server_1.defineTable)({
        organizationId: values_1.v.id("organizations"),
        lecturerId: values_1.v.id("users"),
        title: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        timeLimitMinutes: values_1.v.number(),
        totalQuestions: values_1.v.number(),
        allowedLevels: values_1.v.array(values_1.v.number()), // [1,2,3,4]
        isActive: values_1.v.boolean(),
        publishedAt: values_1.v.optional(values_1.v.number()),
        aiProcessingStatus: values_1.v.optional(values_1.v.union(values_1.v.literal("processing"), values_1.v.literal("completed"), values_1.v.literal("failed"))),
        aiProcessingError: values_1.v.optional(values_1.v.string()),
        aiJobId: values_1.v.optional(values_1.v.id("facultyAssignmentJobs")),
    }).index("by_lecturer", ["lecturerId"])
        .index("by_active", ["isActive"])
        .index("by_organizationId", ["organizationId"])
        .index("by_org_and_lecturer", ["organizationId", "lecturerId"]),
    // Questions within assignments
    questions: (0, server_1.defineTable)({
        assignmentId: values_1.v.id("assignments"),
        questionNumber: values_1.v.number(),
        questionText: values_1.v.string(),
        editedText: values_1.v.optional(values_1.v.string()),
        questionType: values_1.v.optional(values_1.v.string()),
        subject: values_1.v.union(values_1.v.literal("Physics"), values_1.v.literal("Chemistry"), values_1.v.literal("Math")),
        topic: values_1.v.string(),
        difficulty: values_1.v.union(values_1.v.literal("easy"), values_1.v.literal("medium"), values_1.v.literal("hard")),
        givenVariables: values_1.v.optional(values_1.v.string()),
        correctAnswer: values_1.v.optional(values_1.v.string()),
        structuredRepresentation: values_1.v.optional(values_1.v.string()),
        aiAnswer: values_1.v.optional(values_1.v.string()),
        confidenceLevel: values_1.v.optional(values_1.v.union(values_1.v.literal("high"), values_1.v.literal("medium"), values_1.v.literal("low"))),
        confidenceScore: values_1.v.optional(values_1.v.number()),
        generationMethod: values_1.v.optional(values_1.v.string()),
        reviewed: values_1.v.optional(values_1.v.boolean()),
        reviewedAt: values_1.v.optional(values_1.v.number()),
        editedByFaculty: values_1.v.optional(values_1.v.boolean()),
        segmentationConfidence: values_1.v.optional(values_1.v.number()),
        extractionSource: values_1.v.optional(values_1.v.string()),
        imageId: values_1.v.optional(values_1.v.id("_storage")),
    }).index("by_assignment", ["assignmentId"])
        .index("by_assignment_number", ["assignmentId", "questionNumber"]),
    facultyAssignmentJobs: (0, server_1.defineTable)({
        organizationId: values_1.v.id("organizations"),
        assignmentId: values_1.v.id("assignments"),
        facultyId: values_1.v.id("users"),
        status: values_1.v.union(values_1.v.literal("pending"), values_1.v.literal("processing"), values_1.v.literal("review_ready"), values_1.v.literal("completed"), values_1.v.literal("failed")),
        inputType: values_1.v.union(values_1.v.literal("pdf"), values_1.v.literal("text")),
        sourceStorageId: values_1.v.optional(values_1.v.id("_storage")),
        sourceText: values_1.v.optional(values_1.v.string()),
        extractedText: values_1.v.optional(values_1.v.string()),
        processedQuestions: values_1.v.optional(values_1.v.number()),
        error: values_1.v.optional(values_1.v.string()),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
    })
        .index("by_assignment", ["assignmentId"])
        .index("by_faculty_created", ["facultyId", "createdAt"])
        .index("by_organizationId", ["organizationId"])
        .index("by_org_and_assignment", ["organizationId", "assignmentId"]),
    // Student attempts on assignments
    attempts: (0, server_1.defineTable)({
        organizationId: values_1.v.id("organizations"),
        studentId: values_1.v.id("users"),
        assignmentId: values_1.v.id("assignments"),
        questionId: values_1.v.id("questions"),
        startedAt: values_1.v.number(),
        submittedAt: values_1.v.optional(values_1.v.number()),
        timeSpentBeforeFirstHelp: values_1.v.optional(values_1.v.number()),
        studentAnswer: values_1.v.optional(values_1.v.string()),
        studentReasoning: values_1.v.optional(values_1.v.string()),
        isCorrect: values_1.v.optional(values_1.v.boolean()),
        totalHelpRequests: values_1.v.number(),
        helpLevelsUsed: values_1.v.array(values_1.v.number()),
        retryCount: values_1.v.number(),
        copyPasteDetected: values_1.v.boolean(),
        answerBeforeReasoning: values_1.v.boolean(),
        independenceScore: values_1.v.optional(values_1.v.number()),
        cognitiveScore: values_1.v.optional(values_1.v.number()),
    })
        .index("by_studentId_and_assignmentId", ["studentId", "assignmentId"])
        .index("by_assignment", ["assignmentId"])
        .index("by_question", ["questionId"])
        .index("by_question_and_student", ["questionId", "studentId"])
        .index("by_organizationId", ["organizationId"])
        .index("by_org_and_assignment", ["organizationId", "assignmentId"])
        .index("by_org_and_student", ["organizationId", "studentId"])
        .index("by_org_assignment_student", ["organizationId", "assignmentId", "studentId"]),
    // AI chat interactions
    aiInteractions: (0, server_1.defineTable)({
        organizationId: values_1.v.id("organizations"),
        attemptId: values_1.v.id("attempts"),
        helpLevel: values_1.v.number(),
        studentInput: values_1.v.string(),
        aiResponse: values_1.v.string(),
        tokensUsed: values_1.v.optional(values_1.v.number()),
        responseTimeMs: values_1.v.optional(values_1.v.number()),
        reflectionProvided: values_1.v.optional(values_1.v.boolean()),
        reflectionText: values_1.v.optional(values_1.v.string()),
        assignmentId: values_1.v.optional(values_1.v.id("assignments")),
        studentId: values_1.v.optional(values_1.v.id("users")),
    }).index("by_attempt", ["attemptId"])
        .index("by_organizationId", ["organizationId"])
        .index("by_org_and_assignment", ["organizationId", "assignmentId"]),
    aiViolations: (0, server_1.defineTable)({
        attemptId: values_1.v.id("attempts"),
        helpLevel: values_1.v.number(),
        violations: values_1.v.array(values_1.v.string()),
        severity: values_1.v.union(values_1.v.literal("low"), values_1.v.literal("high")),
        regenerationAttempt: values_1.v.number(),
        timestamp: values_1.v.number(),
    }).index("by_attempt", ["attemptId"])
        .index("by_severity", ["severity"]),
    dependencyAlerts: (0, server_1.defineTable)({
        organizationId: values_1.v.id("organizations"),
        studentId: values_1.v.id("users"),
        assignmentId: values_1.v.id("assignments"),
        alertType: values_1.v.union(values_1.v.literal("high_help_frequency"), values_1.v.literal("low_independence"), values_1.v.literal("increasing_dependency"), values_1.v.literal("level_4_overuse")),
        severity: values_1.v.union(values_1.v.literal("low"), values_1.v.literal("medium"), values_1.v.literal("high")),
        message: values_1.v.string(),
        timestamp: values_1.v.number(),
        acknowledged: values_1.v.boolean(),
    })
        .index("by_assignment", ["assignmentId"])
        .index("by_student", ["studentId"])
        .index("by_severity", ["severity", "acknowledged"])
        .index("by_organizationId", ["organizationId"])
        .index("by_org_and_assignment", ["organizationId", "assignmentId"])
        .index("by_org_and_student", ["organizationId", "studentId"]),
    // Session monitoring for exam integrity
    sessionLocks: (0, server_1.defineTable)({
        organizationId: values_1.v.id("organizations"),
        studentId: values_1.v.id("users"),
        assignmentId: values_1.v.id("assignments"),
        isLocked: values_1.v.boolean(),
        tabSwitchCount: values_1.v.number(),
        copyPasteAttempts: values_1.v.number(),
        violationWarnings: values_1.v.array(values_1.v.object({
            type: values_1.v.string(),
            timestamp: values_1.v.number(),
            details: values_1.v.string(),
        })),
        startedAt: values_1.v.number(),
        lastHeartbeat: values_1.v.number(),
    }).index("by_studentId_and_assignmentId", ["studentId", "assignmentId"])
        .index("by_active", ["isLocked"])
        .index("by_organizationId", ["organizationId"])
        .index("by_org_and_assignment", ["organizationId", "assignmentId"])
        .index("by_org_and_student_assignment", ["organizationId", "studentId", "assignmentId"]),
    aiUsageMetrics: (0, server_1.defineTable)({
        organizationId: values_1.v.id("organizations"),
        studentId: values_1.v.id("users"),
        assignmentId: values_1.v.id("assignments"),
        tokensUsed: values_1.v.number(),
        model: values_1.v.string(),
        createdAt: values_1.v.number(),
    }).index("by_organizationId", ["organizationId"])
        .index("by_org_and_assignment", ["organizationId", "assignmentId"])
        .index("by_org_and_student", ["organizationId", "studentId"]),
};
exports.default = (0, server_1.defineSchema)({
    ...server_2.authTables,
    ...applicationTables,
});
