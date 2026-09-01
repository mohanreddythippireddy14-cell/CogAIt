import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { contentBlockValidator } from "./domain/contentBlocks.js";

const applicationTables = {
  organizations: defineTable({
    name: v.string(),
    createdAt: v.number(),
    createdBy: v.id("users"),
    planTier: v.string(),
    isActive: v.boolean(),
  }).index("by_name", ["name"]),

  // Extended user profile data
  userProfiles: defineTable({
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    fullName: v.string(),
    role: v.union(
      v.literal("student"),
      v.literal("lecturer"),
      v.literal("organizationAdmin"),
    ),
    institution: v.optional(v.string()),
    isInternalAdmin: v.optional(v.boolean()),
  }).index("by_user", ["userId"])
    .index("by_organizationId", ["organizationId"]),

  // Assignments created by lecturers
  assignments: defineTable({
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
    totalQuestions: v.number(),
    minReasoningChars: v.optional(v.number()),
    allowedLevels: v.array(v.number()), // [1,2,3,4]
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
  }).index("by_lecturer", ["lecturerId"])
    .index("by_active", ["isActive"])
    .index("by_organizationId", ["organizationId"])
    .index("by_org_and_lecturer", ["organizationId", "lecturerId"]),

  classrooms: defineTable({
    organizationId: v.id("organizations"),
    lecturerId: v.id("users"),
    name: v.string(),
    subject: v.optional(v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"))),
    batchName: v.optional(v.string()),
    studentLimit: v.optional(v.number()),
    joinCode: v.string(),
    isActive: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_join_code", ["joinCode"])
    .index("by_lecturer", ["lecturerId"])
    .index("by_org_and_lecturer", ["organizationId", "lecturerId"])
    .index("by_org_and_code", ["organizationId", "joinCode"]),

  classEnrollments: defineTable({
    organizationId: v.id("organizations"),
    classroomId: v.id("classrooms"),
    studentId: v.id("users"),
    joinedAt: v.number(),
  })
    .index("by_classroom", ["classroomId"])
    .index("by_student", ["studentId"])
    .index("by_classroom_student", ["classroomId", "studentId"])
    .index("by_org_and_student", ["organizationId", "studentId"]),

  // Questions within assignments
  questions: defineTable({
    assignmentId: v.id("assignments"),
    questionNumber: v.number(),
    questionText: v.string(),
    contentBlocks: v.optional(v.array(contentBlockValidator)),
    editedText: v.optional(v.string()),
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
    structuredRepresentation: v.optional(v.string()),
    aiAnswer: v.optional(v.string()),
    confidenceLevel: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
    confidenceScore: v.optional(v.number()),
    generationMethod: v.optional(v.string()),
    reviewed: v.optional(v.boolean()),
    reviewedAt: v.optional(v.number()),
    editedByFaculty: v.optional(v.boolean()),
    segmentationConfidence: v.optional(v.number()),
    extractionSource: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
  }).index("by_assignment", ["assignmentId"])
    .index("by_assignment_number", ["assignmentId", "questionNumber"]),

  facultyAssignmentJobs: defineTable({
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
    facultyId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("review_ready"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("failed_timeout"),
    ),
    inputType: v.union(v.literal("pdf"), v.literal("text")),
    sourceStorageId: v.optional(v.id("_storage")),
    sourceText: v.optional(v.string()),
    uploadRequestKey: v.optional(v.string()),
    sourceHash: v.optional(v.string()),
    sourceTitleNormalized: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    processedQuestions: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_assignment", ["assignmentId"])
    .index("by_faculty_created", ["facultyId", "createdAt"])
    .index("by_organizationId", ["organizationId"])
    .index("by_org_and_assignment", ["organizationId", "assignmentId"])
    .index("by_org_faculty_status", ["organizationId", "facultyId", "status"])
    .index("by_org_faculty_upload_key", ["organizationId", "facultyId", "uploadRequestKey"])
    .index("by_org_faculty_created", ["organizationId", "facultyId", "createdAt"])
    .index("by_org_faculty_sourcehash_created", ["organizationId", "facultyId", "sourceHash", "createdAt"]),

  // Student attempts on assignments
  attempts: defineTable({
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
  })
    .index("by_studentId_and_assignmentId", ["studentId", "assignmentId"])
    .index("by_assignment", ["assignmentId"])
    .index("by_question", ["questionId"])
    .index("by_question_and_student", ["questionId", "studentId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_org_and_assignment", ["organizationId", "assignmentId"])
    .index("by_org_and_student", ["organizationId", "studentId"])
    .index("by_org_assignment_student", ["organizationId", "assignmentId", "studentId"]),

  assignmentProgress: defineTable({
    organizationId: v.id("organizations"),
    studentId: v.id("users"),
    assignmentId: v.id("assignments"),
    activeTimeMs: v.number(),
    sessionStartedAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    lastUpdatedAt: v.number(),
  })
    .index("by_org_and_student", ["organizationId", "studentId"])
    .index("by_org_and_assignment", ["organizationId", "assignmentId"])
    .index("by_org_assignment_student", ["organizationId", "assignmentId", "studentId"]),

  // AI chat interactions
  aiInteractions: defineTable({
    organizationId: v.id("organizations"),
    attemptId: v.id("attempts"),
    helpLevel: v.number(),
    studentInput: v.string(),
    aiResponse: v.string(),
    tokensUsed: v.optional(v.number()),
    responseTimeMs: v.optional(v.number()),
    reflectionProvided: v.optional(v.boolean()),
    reflectionText: v.optional(v.string()),
    assignmentId: v.optional(v.id("assignments")),
    studentId: v.optional(v.id("users")),
  }).index("by_attempt", ["attemptId"])
    .index("by_organizationId", ["organizationId"])
    .index("by_org_and_assignment", ["organizationId", "assignmentId"]),

  aiViolations: defineTable({
    attemptId: v.id("attempts"),
    helpLevel: v.number(),
    violations: v.array(v.string()),
    severity: v.union(v.literal("low"), v.literal("high")),
    regenerationAttempt: v.number(),
    timestamp: v.number(),
  }).index("by_attempt", ["attemptId"])
    .index("by_severity", ["severity"]),

  dependencyAlerts: defineTable({
    organizationId: v.id("organizations"),
    studentId: v.id("users"),
    assignmentId: v.id("assignments"),
    alertType: v.union(
      v.literal("high_help_frequency"),
      v.literal("low_independence"),
      v.literal("increasing_dependency"),
      v.literal("level_4_overuse"),
    ),
    severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    message: v.string(),
    timestamp: v.number(),
    acknowledged: v.boolean(),
    acknowledgedBy: v.optional(v.id("users")),
    acknowledgedAt: v.optional(v.number()),
    interventionNotes: v.optional(v.string()),
  })
    .index("by_assignment", ["assignmentId"])
    .index("by_student", ["studentId"])
    .index("by_severity", ["severity", "acknowledged"])
    .index("by_organizationId", ["organizationId"])
    .index("by_org_and_assignment", ["organizationId", "assignmentId"])
    .index("by_org_and_student", ["organizationId", "studentId"]),

  recommendationState: defineTable({
    organizationId: v.id("organizations"),
    lecturerId: v.id("users"),
    recommendationId: v.string(),
    dismissed: v.boolean(),
    actedUpon: v.boolean(),
    timestamp: v.number(),
  }).index("by_org_and_lecturer", ["organizationId", "lecturerId"])
    .index("by_org_lecturer_recommendation", ["organizationId", "lecturerId", "recommendationId"]),

  lecturerHints: defineTable({
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
    studentId: v.id("users"),
    lecturerId: v.id("users"),
    message: v.string(),
    createdAt: v.number(),
    deliveredAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
  })
    .index("by_org_assignment_student", ["organizationId", "assignmentId", "studentId"])
    .index("by_org_assignment", ["organizationId", "assignmentId"]),

  // Session monitoring for exam integrity
  sessionLocks: defineTable({
    organizationId: v.id("organizations"),
    studentId: v.id("users"),
    assignmentId: v.id("assignments"),
    isLocked: v.boolean(),
    tabSwitchCount: v.number(),
    copyPasteAttempts: v.number(),
    violationWarnings: v.array(v.object({
      type: v.string(),
      timestamp: v.number(),
      details: v.string(),
    })),
    startedAt: v.number(),
    lastHeartbeat: v.number(),
  }).index("by_studentId_and_assignmentId", ["studentId", "assignmentId"])
    .index("by_active", ["isLocked"])
    .index("by_organizationId", ["organizationId"])
    .index("by_org_and_assignment", ["organizationId", "assignmentId"])
    .index("by_org_and_student_assignment", ["organizationId", "studentId", "assignmentId"]),

  aiUsageMetrics: defineTable({
    organizationId: v.id("organizations"),
    studentId: v.id("users"),
    assignmentId: v.id("assignments"),
    tokensUsed: v.number(),
    model: v.string(),
    createdAt: v.number(),
  }).index("by_organizationId", ["organizationId"])
    .index("by_org_and_assignment", ["organizationId", "assignmentId"])
    .index("by_org_and_student", ["organizationId", "studentId"]),

  auditLogs: defineTable({
    organizationId: v.id("organizations"),
    actorId: v.id("users"),
    eventType: v.string(),
    resourceType: v.string(),
    resourceId: v.optional(v.string()),
    metadata: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_organizationId", ["organizationId"])
    .index("by_org_and_event", ["organizationId", "eventType"])
    .index("by_org_event_created", ["organizationId", "eventType", "createdAt"]),

  orgRateLimitCounters: defineTable({
    organizationId: v.id("organizations"),
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
    limit: v.number(),
    updatedAt: v.number(),
  }).index("by_org_key_window", ["organizationId", "key", "windowStart"])
    .index("by_organizationId", ["organizationId"]),

  promptVersionEvents: defineTable({
    organizationId: v.id("organizations"),
    studentId: v.id("users"),
    assignmentId: v.id("assignments"),
    attemptId: v.id("attempts"),
    promptVersion: v.string(),
    model: v.string(),
    createdAt: v.number(),
  }).index("by_organizationId", ["organizationId"])
    .index("by_org_and_assignment", ["organizationId", "assignmentId"])
    .index("by_org_and_student", ["organizationId", "studentId"]),

  assignmentNotifications: defineTable({
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
    studentId: v.id("users"),
    email: v.string(),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    error: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_organizationId", ["organizationId"])
    .index("by_org_and_assignment", ["organizationId", "assignmentId"])
    .index("by_org_and_student", ["organizationId", "studentId"]),

  assignmentAnalyticsRollups: defineTable({
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
    totalStudents: v.number(),
    completedCount: v.number(),
    inProgressCount: v.number(),
    notStartedCount: v.number(),
    avgIndependenceScore: v.number(),
    avgCognitiveScore: v.number(),
    avgHelpRequests: v.number(),
    avgOvertimeSeconds: v.number(),
    highRiskCount: v.number(),
    mediumRiskCount: v.number(),
    lowRiskCount: v.number(),
    lastActivityAt: v.number(),
    metricVersion: v.string(),
    computedAt: v.number(),
    sourceWindowStart: v.number(),
    sourceWindowEnd: v.number(),
    needsRecompute: v.boolean(),
  }).index("by_organizationId", ["organizationId"])
    .index("by_org_assignment", ["organizationId", "assignmentId"])
    .index("by_org_computed", ["organizationId", "computedAt"])
    .index("by_org_needs_recompute", ["organizationId", "needsRecompute"])
    .index("by_org_assignment_computed", ["organizationId", "assignmentId", "computedAt"]),

  studentAnalyticsRollups: defineTable({
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
    studentId: v.id("users"),
    studentName: v.string(),
    studentEmail: v.optional(v.string()),
    progressPercent: v.number(),
    completedQuestions: v.number(),
    totalQuestions: v.number(),
    independenceScore: v.number(),
    cognitiveScore: v.number(),
    avgHelpRequests: v.number(),
    overtimeSeconds: v.number(),
    riskLevel: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    alertCount: v.number(),
    lastActivityAt: v.number(),
    metricVersion: v.string(),
    computedAt: v.number(),
    sourceWindowStart: v.number(),
    sourceWindowEnd: v.number(),
    needsRecompute: v.boolean(),
  }).index("by_organizationId", ["organizationId"])
    .index("by_org_assignment", ["organizationId", "assignmentId"])
    .index("by_org_student", ["organizationId", "studentId"])
    .index("by_org_assignment_student", ["organizationId", "assignmentId", "studentId"])
    .index("by_org_computed", ["organizationId", "computedAt"])
    .index("by_org_needs_recompute", ["organizationId", "needsRecompute"]),

  topicAnalyticsRollups: defineTable({
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
    topic: v.string(),
    subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
    totalAttempts: v.number(),
    completedAttempts: v.number(),
    accuracy: v.number(),
    independence: v.number(),
    avgHelpRequests: v.number(),
    avgTimeSpentMinutes: v.number(),
    dependencyLevel: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    status: v.union(v.literal("strong"), v.literal("moderate"), v.literal("weak")),
    metricVersion: v.string(),
    computedAt: v.number(),
    sourceWindowStart: v.number(),
    sourceWindowEnd: v.number(),
    needsRecompute: v.boolean(),
  }).index("by_organizationId", ["organizationId"])
    .index("by_org_assignment", ["organizationId", "assignmentId"])
    .index("by_org_assignment_topic", ["organizationId", "assignmentId", "topic"])
    .index("by_org_computed", ["organizationId", "computedAt"])
    .index("by_org_needs_recompute", ["organizationId", "needsRecompute"]),

  costGovernancePolicies: defineTable({
    organizationId: v.id("organizations"),
    dailyTokenCap: v.number(),
    softWarningThreshold: v.number(),
    adminOverrideUntil: v.optional(v.number()),
    isActive: v.boolean(),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  costGovernanceDaily: defineTable({
    organizationId: v.id("organizations"),
    dayStart: v.number(),
    tokensUsed: v.number(),
    hardStopTriggered: v.boolean(),
    anomalyDetected: v.boolean(),
    lastUpdated: v.number(),
  }).index("by_org_and_day", ["organizationId", "dayStart"])
    .index("by_organizationId", ["organizationId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
