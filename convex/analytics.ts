import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";
import { isFeatureEnabled } from "./infrastructure/featureFlags";

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
  isCorrect: v.optional(v.boolean()),
  totalHelpRequests: v.number(),
  helpLevelsUsed: v.array(v.number()),
  retryCount: v.number(),
  copyPasteDetected: v.boolean(),
  answerBeforeReasoning: v.boolean(),
  independenceScore: v.optional(v.number()),
  cognitiveScore: v.optional(v.number()),
});

const aiInteractionValidator = v.object({
  _id: v.id("aiInteractions"),
  _creationTime: v.number(),
  attemptId: v.id("attempts"),
  helpLevel: v.number(),
  studentInput: v.string(),
  aiResponse: v.string(),
  tokensUsed: v.optional(v.number()),
  responseTimeMs: v.optional(v.number()),
  reflectionProvided: v.optional(v.boolean()),
  reflectionText: v.optional(v.string()),
});

const assignmentValidator = v.object({
  _id: v.id("assignments"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  lecturerId: v.id("users"),
  title: v.string(),
  description: v.optional(v.string()),
  timeLimitMinutes: v.number(),
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
  classroomId: v.optional(v.id("classrooms")),
  subject: v.optional(v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"))),
  chapter: v.optional(v.string()),
  difficulty: v.optional(v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"), v.literal("mixed"))),
  dueDate: v.optional(v.number()),
  instructions: v.optional(v.string()),
  minReasoningChars: v.optional(v.number()),
  targetStudentId: v.optional(v.id("users")),
  isDeepDive: v.optional(v.boolean()),
  sourceAssignmentId: v.optional(v.id("assignments")),
});

export const getAssignmentAnalytics = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      _id: v.id("attempts"),
      _creationTime: v.number(),
      studentId: v.id("users"),
      assignmentId: v.id("assignments"),
      questionId: v.id("questions"),
      startedAt: v.number(),
      submittedAt: v.optional(v.number()),
      timeSpentBeforeFirstHelp: v.optional(v.number()),
      studentAnswer: v.optional(v.string()),
      studentReasoning: v.optional(v.string()),
      isCorrect: v.optional(v.boolean()),
      totalHelpRequests: v.number(),
      helpLevelsUsed: v.array(v.number()),
      retryCount: v.number(),
      copyPasteDetected: v.boolean(),
      answerBeforeReasoning: v.boolean(),
      independenceScore: v.optional(v.number()),
      cognitiveScore: v.optional(v.number()),
      overtimeSeconds: v.optional(v.number()),
      aiInteractions: v.array(aiInteractionValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Assignment not found or access denied");
    }

    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found or access denied");
    }
    if (!assignment.organizationId) {
      throw new Error("Assignment organization is missing. Run legacy backfill.");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);
    if (profile.role === "lecturer" && assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const progressRows = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const overtimeByStudent = new Map(
      progressRows.map((row) => {
        const runningDelta = row.sessionStartedAt ? Math.max(0, Date.now() - row.sessionStartedAt) : 0;
        const totalSeconds = Math.floor((row.activeTimeMs + runningDelta) / 1000);
        const overtimeSeconds = Math.max(0, totalSeconds - assignment.timeLimitMinutes * 60);
        return [row.studentId.toString(), overtimeSeconds];
      }),
    );

    let interactionsByAttempt = new Map<string, Array<any>>();
    if (isFeatureEnabled("optimizedQueries", profile.organizationId)) {
      const interactions = await ctx.db
        .query("aiInteractions")
        .withIndex("by_org_and_assignment", (q) =>
          q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId),
        )
        .collect();
      interactionsByAttempt = interactions.reduce((acc, interaction) => {
        const key = interaction.attemptId.toString();
        const current = acc.get(key) ?? [];
        current.push(interaction);
        acc.set(key, current);
        return acc;
      }, new Map<string, Array<any>>());
    } else {
      interactionsByAttempt = new Map(
        (
          await Promise.all(
            attempts.map(async (attempt) => {
              const aiInteractions = await ctx.db
                .query("aiInteractions")
                .withIndex("by_attempt", (q) => q.eq("attemptId", attempt._id))
                .collect();
              return [attempt._id.toString(), aiInteractions] as const;
            }),
          )
        ).map(([attemptId, aiInteractions]) => [attemptId, aiInteractions]),
      );
    }

    return attempts.map((attempt) => ({
      ...attempt,
      overtimeSeconds: overtimeByStudent.get(attempt.studentId.toString()) ?? 0,
      aiInteractions: interactionsByAttempt.get(attempt._id.toString()) ?? [],
    }));
  },
});

export const getStudentProgress = query({
  args: {
    studentId: v.id("users"),
    assignmentId: v.optional(v.id("assignments")),
  },
  returns: v.array(attemptValidator),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Assignment not found or access denied");
    }

    const assignmentId = args.assignmentId;
    if (assignmentId) {
      const assignment = await ctx.db.get(assignmentId);
      if (!assignment) {
        throw new Error("Assignment not found or access denied");
      }
      if (!assignment.organizationId) {
        throw new Error("Assignment organization is missing. Run legacy backfill.");
      }
      requireSameOrganization(assignment.organizationId, profile.organizationId);
      if (profile.role === "lecturer" && assignment.lecturerId !== userId) {
        throw new Error("Assignment not found or access denied");
      }
    }

    if (assignmentId) {
      return await ctx.db
        .query("attempts")
        .withIndex("by_org_assignment_student", (q) =>
          q.eq("organizationId", profile.organizationId)
            .eq("assignmentId", assignmentId)
            .eq("studentId", args.studentId),
        )
        .collect();
    }

    return await ctx.db
      .query("attempts")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", args.studentId),
      )
      .collect();
  },
});

export const getClassOverview = query({
  args: {},
  returns: v.array(
    v.object({
      assignment: assignmentValidator,
      attempts: v.array(attemptValidator),
    }),
  ),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only lecturers can access class overview");
    }

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

    if (isFeatureEnabled("optimizedQueries", profile.organizationId)) {
      const allAttempts = await ctx.db
        .query("attempts")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
        .collect();
      const attemptsByAssignment = allAttempts.reduce((acc, attempt) => {
        const key = attempt.assignmentId.toString();
        const current = acc.get(key) ?? [];
        current.push(attempt);
        acc.set(key, current);
        return acc;
      }, new Map<string, Array<any>>());

      return assignments.map((assignment) => ({
        assignment,
        attempts: attemptsByAssignment.get(assignment._id.toString()) ?? [],
      }));
    }

    return await Promise.all(
      assignments.map(async (assignment) => ({
        assignment,
        attempts: await ctx.db
          .query("attempts")
          .withIndex("by_org_and_assignment", (q) =>
            q.eq("organizationId", profile.organizationId).eq("assignmentId", assignment._id),
          )
          .collect(),
      })),
    );
  },
});

export const getFacultyInterventionOverview = query({
  args: {},
  returns: v.object({
    highRiskStudents: v.number(),
    overtimeStudents: v.number(),
    fragileAttempts: v.number(),
    todayInterventions: v.number(),
  }),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only faculty can access this view.");
    }

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
    const assignmentIds = new Set(assignments.map((assignment) => assignment._id.toString()));
    const assignmentById = new Map(assignments.map((assignment) => [assignment._id.toString(), assignment]));

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const filteredAttempts = attempts.filter((attempt) => assignmentIds.has(attempt.assignmentId.toString()));

    const highRiskStudentIds = new Set<string>();
    let fragileAttempts = 0;
    for (const attempt of filteredAttempts) {
      const score = attempt.independenceScore ?? 0;
      if (score < 40) {
        fragileAttempts += 1;
        highRiskStudentIds.add(attempt.studentId.toString());
      }
    }

    const progressRows = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_and_assignment", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const overtimeStudents = new Set<string>();
    for (const progress of progressRows) {
      if (!assignmentIds.has(progress.assignmentId.toString())) {
        continue;
      }
      const assignment = assignmentById.get(progress.assignmentId.toString());
      if (!assignment) {
        continue;
      }
      const runningDelta = progress.sessionStartedAt ? Math.max(0, Date.now() - progress.sessionStartedAt) : 0;
      const elapsedSeconds = Math.floor((progress.activeTimeMs + runningDelta) / 1000);
      if (elapsedSeconds > assignment.timeLimitMinutes * 60) {
        overtimeStudents.add(progress.studentId.toString());
      }
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayInterventions = filteredAttempts.filter(
      (attempt) => (attempt.submittedAt ?? attempt.startedAt) >= dayStart.getTime() && (attempt.independenceScore ?? 0) < 60,
    ).length;

    return {
      highRiskStudents: highRiskStudentIds.size,
      overtimeStudents: overtimeStudents.size,
      fragileAttempts,
      todayInterventions,
    };
  },
});

export const getAtRiskStudentsForAssignment = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      studentId: v.id("users"),
      fullName: v.string(),
      avgIndependence: v.number(),
      avgHelpRequests: v.number(),
      overtimeMinutes: v.number(),
      attemptsCount: v.number(),
      riskLevel: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only faculty can access this view.");
    }
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found.");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);
    if (profile.role === "lecturer" && assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied");
    }

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const progressRows = await ctx.db
      .query("assignmentProgress")
      .withIndex("by_org_and_assignment", (q) =>
        q.eq("organizationId", profile.organizationId).eq("assignmentId", args.assignmentId),
      )
      .collect();
    const profiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const nameByUser = new Map(profiles.map((entry) => [entry.userId.toString(), entry.fullName]));
    const progressByStudent = new Map(progressRows.map((row) => [row.studentId.toString(), row]));

    const grouped = attempts.reduce((acc, attempt) => {
      const key = attempt.studentId.toString();
      const bucket = acc.get(key) ?? [];
      bucket.push(attempt);
      acc.set(key, bucket);
      return acc;
    }, new Map<string, typeof attempts>());

    const result = Array.from(grouped.entries()).map(([studentKey, rows]) => {
      const scored = rows.filter((row) => row.submittedAt);
      const avgIndependence = scored.length > 0
        ? Math.round(scored.reduce((sum, row) => sum + (row.independenceScore ?? 0), 0) / scored.length)
        : 0;
      const avgHelpRequests = scored.length > 0
        ? Math.round((scored.reduce((sum, row) => sum + row.totalHelpRequests, 0) / scored.length) * 10) / 10
        : 0;
      const progress = progressByStudent.get(studentKey);
      const runningDelta = progress?.sessionStartedAt ? Math.max(0, Date.now() - progress.sessionStartedAt) : 0;
      const totalSeconds = Math.floor(((progress?.activeTimeMs ?? 0) + runningDelta) / 1000);
      const overtimeMinutes = Math.max(0, Math.round((totalSeconds - assignment.timeLimitMinutes * 60) / 60));
      const riskLevel: "low" | "medium" | "high" =
        avgIndependence < 40 || avgHelpRequests >= 3 || overtimeMinutes >= 10
          ? "high"
          : avgIndependence < 60 || avgHelpRequests >= 2 || overtimeMinutes >= 3
            ? "medium"
            : "low";
      return {
        studentId: rows[0].studentId,
        fullName: nameByUser.get(studentKey) ?? "Unknown Student",
        avgIndependence,
        avgHelpRequests,
        overtimeMinutes,
        attemptsCount: rows.length,
        riskLevel,
      };
    });

    return result.sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      if (rank[a.riskLevel] !== rank[b.riskLevel]) {
        return rank[a.riskLevel] - rank[b.riskLevel];
      }
      return b.overtimeMinutes - a.overtimeMinutes;
    });
  },
});

export const getFacultyInterventionStudents = query({
  args: {
    type: v.union(
      v.literal("high_risk"),
      v.literal("overtime"),
      v.literal("fragile"),
      v.literal("today"),
    ),
  },
  returns: v.array(
    v.object({
      studentId: v.id("users"),
      fullName: v.string(),
      assignmentsTouched: v.number(),
      avgIndependence: v.number(),
      avgHelpRequests: v.number(),
      overtimeMinutes: v.number(),
      fragileAttempts: v.number(),
      todayInterventions: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only faculty can access this view.");
    }

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
    const assignmentById = new Map(assignments.map((assignment) => [assignment._id.toString(), assignment]));
    const assignmentIds = new Set(Array.from(assignmentById.keys()));

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const relevantAttempts = attempts.filter((attempt) => assignmentIds.has(attempt.assignmentId.toString()));

    const relevantProgress = (
      await Promise.all(
        assignments.map((assignment) =>
          ctx.db
            .query("assignmentProgress")
            .withIndex("by_org_and_assignment", (q) =>
              q.eq("organizationId", profile.organizationId).eq("assignmentId", assignment._id),
            )
            .collect(),
        ),
      )
    ).flat();

    const profiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const nameByUser = new Map(profiles.map((entry) => [entry.userId.toString(), entry.fullName]));

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayStartTs = dayStart.getTime();

    const baseByStudent = new Map<
      string,
      {
        studentId: (typeof relevantAttempts)[number]["studentId"];
        attemptsCount: number;
        assignmentsTouched: Set<string>;
        independenceTotal: number;
        independenceCount: number;
        helpTotal: number;
        fragileAttempts: number;
        todayInterventions: number;
      }
    >();

    for (const attempt of relevantAttempts) {
      const key = attempt.studentId.toString();
      const current = baseByStudent.get(key) ?? {
        studentId: attempt.studentId,
        attemptsCount: 0,
        assignmentsTouched: new Set<string>(),
        independenceTotal: 0,
        independenceCount: 0,
        helpTotal: 0,
        fragileAttempts: 0,
        todayInterventions: 0,
      };
      current.attemptsCount += 1;
      current.assignmentsTouched.add(attempt.assignmentId.toString());
      current.helpTotal += attempt.totalHelpRequests;
      if (attempt.submittedAt) {
        current.independenceTotal += attempt.independenceScore ?? 0;
        current.independenceCount += 1;
      }
      if ((attempt.independenceScore ?? 0) < 40) {
        current.fragileAttempts += 1;
      }
      if ((attempt.submittedAt ?? attempt.startedAt) >= dayStartTs && (attempt.independenceScore ?? 0) < 60) {
        current.todayInterventions += 1;
      }
      baseByStudent.set(key, current);
    }

    const overtimeByStudent = new Map<string, number>();
    for (const progress of relevantProgress) {
      const assignment = assignmentById.get(progress.assignmentId.toString());
      if (!assignment) {
        continue;
      }
      const runningDelta = progress.sessionStartedAt ? Math.max(0, Date.now() - progress.sessionStartedAt) : 0;
      const elapsedSeconds = Math.floor((progress.activeTimeMs + runningDelta) / 1000);
      const overtimeSeconds = Math.max(0, elapsedSeconds - assignment.timeLimitMinutes * 60);
      if (overtimeSeconds <= 0) {
        continue;
      }
      const key = progress.studentId.toString();
      const previous = overtimeByStudent.get(key) ?? 0;
      overtimeByStudent.set(key, previous + Math.round(overtimeSeconds / 60));
    }

    const students = Array.from(baseByStudent.entries()).map(([studentKey, row]) => {
      const avgIndependence = row.independenceCount > 0
        ? Math.round(row.independenceTotal / row.independenceCount)
        : 0;
      const avgHelpRequests = row.attemptsCount > 0
        ? Math.round((row.helpTotal / row.attemptsCount) * 10) / 10
        : 0;
      return {
        studentId: row.studentId,
        fullName: nameByUser.get(studentKey) ?? "Unknown Student",
        assignmentsTouched: row.assignmentsTouched.size,
        avgIndependence,
        avgHelpRequests,
        overtimeMinutes: overtimeByStudent.get(studentKey) ?? 0,
        fragileAttempts: row.fragileAttempts,
        todayInterventions: row.todayInterventions,
      };
    });

    const filtered = students.filter((student) => {
      if (args.type === "high_risk") {
        return student.avgIndependence < 40;
      }
      if (args.type === "overtime") {
        return student.overtimeMinutes > 0;
      }
      if (args.type === "fragile") {
        return student.fragileAttempts > 0;
      }
      return student.todayInterventions > 0;
    });

    return filtered.sort((a, b) => {
      if (args.type === "overtime") {
        return b.overtimeMinutes - a.overtimeMinutes;
      }
      if (args.type === "fragile") {
        return b.fragileAttempts - a.fragileAttempts;
      }
      if (args.type === "today") {
        return b.todayInterventions - a.todayInterventions;
      }
      return a.avgIndependence - b.avgIndependence;
    });
  },
});
