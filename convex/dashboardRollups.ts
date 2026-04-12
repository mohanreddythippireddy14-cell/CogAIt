import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { METRIC_CONTRACTS } from "./constants";
import { riskFromIndependence } from "./domain/scoring";

function extractEmail(userDoc: unknown): string | undefined {
  if (!userDoc || typeof userDoc !== "object") {
    return undefined;
  }
  const candidate = userDoc as {
    email?: unknown;
    emailVerification?: { email?: unknown };
    emailAddresses?: Array<{ email?: unknown }>;
  };
  if (typeof candidate.email === "string") {
    return candidate.email;
  }
  if (typeof candidate.emailVerification?.email === "string") {
    return candidate.emailVerification.email;
  }
  const primary = candidate.emailAddresses?.find((entry) => typeof entry.email === "string");
  if (typeof primary?.email === "string") {
    return primary.email;
  }
  return undefined;
}

function isCompletedAttempt(attempt: Doc<"attempts">): boolean {
  return Boolean(attempt.submittedAt && (attempt.studentAnswer ?? "").trim().length > 0);
}

function toSafePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

type Subject = "Physics" | "Chemistry" | "Math";

export const recomputeAssignmentRollups = internalMutation({
  args: {
    assignmentId: v.id("assignments"),
    sourceWindowStart: v.optional(v.number()),
    sourceWindowEnd: v.optional(v.number()),
  },
  returns: v.object({
    assignmentRollupUpdated: v.boolean(),
    studentRollupsUpdated: v.number(),
    topicRollupsUpdated: v.number(),
  }),
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found.");
    }
    const organizationId = assignment.organizationId;
    const now = Date.now();
    const sourceWindowStart = args.sourceWindowStart ?? assignment._creationTime;
    const sourceWindowEnd = args.sourceWindowEnd ?? now;

    const [attempts, progressRows, questions, alertRows, profiles] = await Promise.all([
      ctx.db
        .query("attempts")
        .withIndex("by_org_and_assignment", (q) =>
          q.eq("organizationId", organizationId).eq("assignmentId", args.assignmentId),
        )
        .collect(),
      ctx.db
        .query("assignmentProgress")
        .withIndex("by_org_and_assignment", (q) =>
          q.eq("organizationId", organizationId).eq("assignmentId", args.assignmentId),
        )
        .collect(),
      ctx.db
        .query("questions")
        .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
        .collect(),
      ctx.db
        .query("dependencyAlerts")
        .withIndex("by_org_and_assignment", (q) =>
          q.eq("organizationId", organizationId).eq("assignmentId", args.assignmentId),
        )
        .collect(),
      ctx.db
        .query("userProfiles")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .collect(),
    ]);

    const questionById = new Map(questions.map((q) => [q._id.toString(), q]));
    const profileByUserId = new Map(profiles.map((p) => [p.userId.toString(), p]));

    const attemptsByStudent = new Map<string, Doc<"attempts">[]>();
    for (const attempt of attempts) {
      const key = attempt.studentId.toString();
      const bucket = attemptsByStudent.get(key) ?? [];
      bucket.push(attempt);
      attemptsByStudent.set(key, bucket);
    }
    const progressByStudent = new Map(progressRows.map((row) => [row.studentId.toString(), row]));
    const activeAlertsByStudent = new Map<string, number>();
    for (const alert of alertRows.filter((row) => !row.acknowledged)) {
      const key = alert.studentId.toString();
      activeAlertsByStudent.set(key, (activeAlertsByStudent.get(key) ?? 0) + 1);
    }

    let enrolledStudentIds = new Set<string>();
    if (assignment.classroomId) {
      const enrollments = await ctx.db
        .query("classEnrollments")
        .withIndex("by_classroom", (q) => q.eq("classroomId", assignment.classroomId!))
        .collect();
      enrolledStudentIds = new Set(enrollments.map((e) => e.studentId.toString()));
    }
    const relevantStudentIds = enrolledStudentIds.size > 0
      ? enrolledStudentIds
      : new Set([
          ...Array.from(attemptsByStudent.keys()),
          ...Array.from(progressByStudent.keys()),
        ]);

    const studentRollupRows: Array<{
      organizationId: Id<"organizations">;
      assignmentId: Id<"assignments">;
      studentId: Id<"users">;
      studentName: string;
      studentEmail?: string;
      progressPercent: number;
      completedQuestions: number;
      totalQuestions: number;
      independenceScore: number;
      cognitiveScore: number;
      avgHelpRequests: number;
      overtimeSeconds: number;
      riskLevel: "high" | "medium" | "low";
      alertCount: number;
      lastActivityAt: number;
      metricVersion: string;
      computedAt: number;
      sourceWindowStart: number;
      sourceWindowEnd: number;
      needsRecompute: boolean;
    }> = [];

    for (const studentIdString of relevantStudentIds) {
      const profile = profileByUserId.get(studentIdString);
      if (!profile) {
        continue;
      }
      const studentAttempts = attemptsByStudent.get(studentIdString) ?? [];
      const completed = studentAttempts.filter(isCompletedAttempt);
      const completedQuestions = completed.length;
      const totalQuestions = Math.max(assignment.totalQuestions, questions.length);
      const progressPercent = toSafePercent(completedQuestions, Math.max(1, totalQuestions));
      const independenceScore = completed.length > 0
        ? Math.round(completed.reduce((sum, row) => sum + (row.independenceScore ?? 0), 0) / completed.length)
        : 0;
      const cognitiveScore = completed.length > 0
        ? Math.round(completed.reduce((sum, row) => sum + (row.cognitiveScore ?? 0), 0) / completed.length)
        : 0;
      const avgHelpRequests = studentAttempts.length > 0
        ? Math.round((studentAttempts.reduce((sum, row) => sum + row.totalHelpRequests, 0) / studentAttempts.length) * 10) / 10
        : 0;
      const progress = progressByStudent.get(studentIdString);
      const runningDelta = progress?.sessionStartedAt ? Math.max(0, now - progress.sessionStartedAt) : 0;
      const totalActiveMs = (progress?.activeTimeMs ?? 0) + runningDelta;
      const overtimeSeconds = Math.max(0, Math.floor(totalActiveMs / 1000) - assignment.timeLimitMinutes * 60);
      const lastActivityAt = Math.max(
        progress?.lastUpdatedAt ?? 0,
        studentAttempts.reduce((max, row) => Math.max(max, row._creationTime), 0),
      );
      const riskLevel = riskFromIndependence(independenceScore);
      const userDoc = await ctx.db.get(profile.userId);
      const studentEmail = extractEmail(userDoc);

      studentRollupRows.push({
        organizationId,
        assignmentId: assignment._id,
        studentId: profile.userId,
        studentName: profile.fullName,
        studentEmail,
        progressPercent,
        completedQuestions,
        totalQuestions,
        independenceScore,
        cognitiveScore,
        avgHelpRequests,
        overtimeSeconds,
        riskLevel,
        alertCount: activeAlertsByStudent.get(studentIdString) ?? 0,
        lastActivityAt,
        metricVersion: METRIC_CONTRACTS.rollupMetricVersion,
        computedAt: now,
        sourceWindowStart,
        sourceWindowEnd,
        needsRecompute: false,
      });
    }

    const highRiskCount = studentRollupRows.filter((row) => row.riskLevel === "high").length;
    const mediumRiskCount = studentRollupRows.filter((row) => row.riskLevel === "medium").length;
    const lowRiskCount = studentRollupRows.filter((row) => row.riskLevel === "low").length;
    const completedCount = studentRollupRows.filter((row) => row.completedQuestions >= Math.max(1, row.totalQuestions)).length;
    const inProgressCount = studentRollupRows.filter(
      (row) => row.completedQuestions > 0 && row.completedQuestions < Math.max(1, row.totalQuestions),
    ).length;
    const totalStudents = studentRollupRows.length;
    const notStartedCount = Math.max(0, totalStudents - completedCount - inProgressCount);
    const avgIndependenceScore = totalStudents > 0
      ? Math.round(studentRollupRows.reduce((sum, row) => sum + row.independenceScore, 0) / totalStudents)
      : 0;
    const avgCognitiveScore = totalStudents > 0
      ? Math.round(studentRollupRows.reduce((sum, row) => sum + row.cognitiveScore, 0) / totalStudents)
      : 0;
    const avgHelpRequests = totalStudents > 0
      ? Math.round((studentRollupRows.reduce((sum, row) => sum + row.avgHelpRequests, 0) / totalStudents) * 10) / 10
      : 0;
    const avgOvertimeSeconds = totalStudents > 0
      ? Math.round(studentRollupRows.reduce((sum, row) => sum + row.overtimeSeconds, 0) / totalStudents)
      : 0;
    const lastActivityAt = studentRollupRows.reduce((max, row) => Math.max(max, row.lastActivityAt), 0);

    const assignmentRollup = await ctx.db
      .query("assignmentAnalyticsRollups")
      .withIndex("by_org_assignment", (q) =>
        q.eq("organizationId", organizationId).eq("assignmentId", assignment._id),
      )
      .first();
    const assignmentPatch = {
      totalStudents,
      completedCount,
      inProgressCount,
      notStartedCount,
      avgIndependenceScore,
      avgCognitiveScore,
      avgHelpRequests,
      avgOvertimeSeconds,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount,
      lastActivityAt,
      metricVersion: METRIC_CONTRACTS.rollupMetricVersion,
      computedAt: now,
      sourceWindowStart,
      sourceWindowEnd,
      needsRecompute: false,
    };
    if (assignmentRollup) {
      await ctx.db.patch(assignmentRollup._id, assignmentPatch);
    } else {
      await ctx.db.insert("assignmentAnalyticsRollups", {
        organizationId,
        assignmentId: assignment._id,
        ...assignmentPatch,
      });
    }

    const existingStudentRollups = await ctx.db
      .query("studentAnalyticsRollups")
      .withIndex("by_org_assignment", (q) =>
        q.eq("organizationId", organizationId).eq("assignmentId", assignment._id),
      )
      .collect();
    const existingByStudent = new Map(existingStudentRollups.map((row) => [row.studentId.toString(), row]));
    const currentStudentIds = new Set(studentRollupRows.map((row) => row.studentId.toString()));
    for (const row of studentRollupRows) {
      const existing = existingByStudent.get(row.studentId.toString());
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("studentAnalyticsRollups", row);
      }
    }
    for (const staleRow of existingStudentRollups) {
      if (!currentStudentIds.has(staleRow.studentId.toString())) {
        await ctx.db.delete(staleRow._id);
      }
    }

    const attemptsByTopic = new Map<string, Doc<"attempts">[]>();
    const topicSubject = new Map<string, Subject>();
    for (const attempt of attempts) {
      const question = questionById.get(attempt.questionId.toString());
      if (!question) {
        continue;
      }
      const topicKey = question.topic;
      const bucket = attemptsByTopic.get(topicKey) ?? [];
      bucket.push(attempt);
      attemptsByTopic.set(topicKey, bucket);
      topicSubject.set(topicKey, question.subject as Subject);
    }

    const topicRollupRows = Array.from(attemptsByTopic.entries()).map(([topic, rows]) => {
      const completedAttempts = rows.filter(isCompletedAttempt);
      const correctCount = completedAttempts.filter((row) => row.isCorrect === true).length;
      const accuracy = completedAttempts.length > 0
        ? Math.round((correctCount / completedAttempts.length) * 100)
        : 0;
      const independence = completedAttempts.length > 0
        ? Math.round(
            completedAttempts.reduce((sum, row) => sum + (row.independenceScore ?? 0), 0) / completedAttempts.length,
          )
        : 0;
      const avgHelpRequests = rows.length > 0
        ? Math.round((rows.reduce((sum, row) => sum + row.totalHelpRequests, 0) / rows.length) * 10) / 10
        : 0;
      const avgTimeSpentMinutes = completedAttempts.length > 0
        ? Math.round(
            (completedAttempts.reduce(
              (sum, row) => sum + ((row.submittedAt ?? row.startedAt) - row.startedAt),
              0,
            ) /
              completedAttempts.length /
              1000 /
              60) *
              10,
          ) / 10
        : 0;
      const dependencyLevel: "low" | "medium" | "high" =
        independence < 40 ? "high" : independence < 60 ? "medium" : "low";
      const status: "strong" | "moderate" | "weak" =
        independence >= 70 ? "strong" : independence >= 40 ? "moderate" : "weak";
      return {
        organizationId,
        assignmentId: assignment._id,
        topic,
        subject: topicSubject.get(topic) ?? "Physics",
        totalAttempts: rows.length,
        completedAttempts: completedAttempts.length,
        accuracy,
        independence,
        avgHelpRequests,
        avgTimeSpentMinutes,
        dependencyLevel,
        status,
        metricVersion: METRIC_CONTRACTS.rollupMetricVersion,
        computedAt: now,
        sourceWindowStart,
        sourceWindowEnd,
        needsRecompute: false,
      };
    });

    const existingTopicRollups = await ctx.db
      .query("topicAnalyticsRollups")
      .withIndex("by_org_assignment", (q) =>
        q.eq("organizationId", organizationId).eq("assignmentId", assignment._id),
      )
      .collect();
    const existingTopicByName = new Map(existingTopicRollups.map((row) => [row.topic, row]));
    const currentTopics = new Set(topicRollupRows.map((row) => row.topic));
    for (const row of topicRollupRows) {
      const existing = existingTopicByName.get(row.topic);
      if (existing) {
        await ctx.db.patch(existing._id, row);
      } else {
        await ctx.db.insert("topicAnalyticsRollups", row);
      }
    }
    for (const staleRow of existingTopicRollups) {
      if (!currentTopics.has(staleRow.topic)) {
        await ctx.db.delete(staleRow._id);
      }
    }

    return {
      assignmentRollupUpdated: true,
      studentRollupsUpdated: studentRollupRows.length,
      topicRollupsUpdated: topicRollupRows.length,
    };
  },
});

export const markRollupsNeedsRecompute = internalMutation({
  args: {
    assignmentId: v.id("assignments"),
    value: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      return null;
    }
    const organizationId = assignment.organizationId;
    const assignmentRollup = await ctx.db
      .query("assignmentAnalyticsRollups")
      .withIndex("by_org_assignment", (q) =>
        q.eq("organizationId", organizationId).eq("assignmentId", assignment._id),
      )
      .first();
    if (assignmentRollup) {
      await ctx.db.patch(assignmentRollup._id, { needsRecompute: args.value });
    }
    const [studentRows, topicRows] = await Promise.all([
      ctx.db
        .query("studentAnalyticsRollups")
        .withIndex("by_org_assignment", (q) =>
          q.eq("organizationId", organizationId).eq("assignmentId", assignment._id),
        )
        .collect(),
      ctx.db
        .query("topicAnalyticsRollups")
        .withIndex("by_org_assignment", (q) =>
          q.eq("organizationId", organizationId).eq("assignmentId", assignment._id),
        )
        .collect(),
    ]);
    for (const row of studentRows) {
      await ctx.db.patch(row._id, { needsRecompute: args.value });
    }
    for (const row of topicRows) {
      await ctx.db.patch(row._id, { needsRecompute: args.value });
    }
    return null;
  },
});

export const getAssignmentRollup = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
  },
  returns: v.union(
    v.object({
      _id: v.id("assignmentAnalyticsRollups"),
      _creationTime: v.number(),
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
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("assignmentAnalyticsRollups")
      .withIndex("by_org_assignment", (q) =>
        q.eq("organizationId", args.organizationId).eq("assignmentId", args.assignmentId),
      )
      .first();
  },
});

export const getStudentRollupsByAssignment = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      _id: v.id("studentAnalyticsRollups"),
      _creationTime: v.number(),
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
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("studentAnalyticsRollups")
      .withIndex("by_org_assignment", (q) =>
        q.eq("organizationId", args.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
  },
});

export const getTopicRollupsByAssignment = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      _id: v.id("topicAnalyticsRollups"),
      _creationTime: v.number(),
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
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("topicAnalyticsRollups")
      .withIndex("by_org_assignment", (q) =>
        q.eq("organizationId", args.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
  },
});

export const getStudentRollupByAssignmentStudent = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
    studentId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("studentAnalyticsRollups"),
      _creationTime: v.number(),
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
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("studentAnalyticsRollups")
      .withIndex("by_org_assignment_student", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("assignmentId", args.assignmentId)
          .eq("studentId", args.studentId),
      )
      .first();
  },
});

export const getAssignmentRollupsForOrganization = internalQuery({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.array(
    v.object({
      _id: v.id("assignmentAnalyticsRollups"),
      _creationTime: v.number(),
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
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("assignmentAnalyticsRollups")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});
