import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireAuthFromAction } from "./lib/authGuards";

type AnalyticsInteraction = {
  _id: Id<"aiInteractions">;
  attemptId: Id<"attempts">;
  _creationTime: number;
  helpLevel: number;
  tokensUsed?: number;
  reflectionProvided?: boolean;
};

type AnalyticsAttemptRow = {
  _id: Id<"attempts">;
  studentId: Id<"users">;
  questionId: Id<"questions">;
  startedAt: number;
  submittedAt?: number;
  isCorrect?: boolean;
  totalHelpRequests: number;
  independenceScore?: number;
  cognitiveScore?: number;
  helpLevelsUsed: number[];
  aiInteractions: AnalyticsInteraction[];
};

function escapeCsv(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function attemptsToCsv(
  attempts: Array<{
    studentId: string;
    questionId: string;
    startedAt: number;
    submittedAt?: number;
    isCorrect?: boolean;
    totalHelpRequests: number;
    independenceScore?: number;
    cognitiveScore?: number;
  }>,
): string {
  const header = [
    "studentId",
    "questionId",
    "startedAt",
    "submittedAt",
    "isCorrect",
    "totalHelpRequests",
    "independenceScore",
    "cognitiveScore",
  ];
  const rows = attempts.map((attempt) =>
    [
      attempt.studentId,
      attempt.questionId,
      new Date(attempt.startedAt).toISOString(),
      attempt.submittedAt ? new Date(attempt.submittedAt).toISOString() : "",
      attempt.isCorrect ?? "",
      attempt.totalHelpRequests,
      attempt.independenceScore ?? "",
      attempt.cognitiveScore ?? "",
    ]
      .map(escapeCsv)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export const exportAssignmentData = httpAction(async (ctx, request) => {
  try {
    await requireAuthFromAction(ctx);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const user = await ctx.runQuery(api.users.loggedInUserWithProfile, {});
  if (!user?.profile) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (user.profile.role !== "lecturer" && user.profile.role !== "organizationAdmin") {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const assignmentId = url.searchParams.get("assignmentId") as Id<"assignments"> | null;
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  if (!assignmentId) {
    return new Response("Missing assignmentId", { status: 400 });
  }
  if (format !== "json" && format !== "csv") {
    return new Response("Unsupported format. Use json or csv.", { status: 400 });
  }

  try {
    const assignment = await ctx.runQuery(api.assignments.getLecturerAssignmentForEdit, {
      assignmentId,
    });
    if (!assignment) {
      return new Response("Assignment not found or access denied", { status: 404 });
    }
    const questions = await ctx.runQuery(api.assignments.getLecturerAssignmentQuestions, {
      assignmentId,
    });
    const attemptRows = (await ctx.runQuery(api.analytics.getAssignmentAnalytics, {
      assignmentId,
    })) as AnalyticsAttemptRow[];

    const flatAttempts = attemptRows.map((row: AnalyticsAttemptRow) => ({
      studentId: row.studentId.toString(),
      questionId: row.questionId.toString(),
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      isCorrect: row.isCorrect,
      totalHelpRequests: row.totalHelpRequests,
      independenceScore: row.independenceScore,
      cognitiveScore: row.cognitiveScore,
    }));
    const aiInteractions = attemptRows.flatMap((row: AnalyticsAttemptRow) =>
      row.aiInteractions.map((interaction: AnalyticsInteraction) => ({
        interactionId: interaction._id.toString(),
        attemptId: interaction.attemptId.toString(),
        helpLevel: interaction.helpLevel,
        createdAt: interaction._creationTime,
        tokensUsed: interaction.tokensUsed ?? 0,
        reflectionProvided: interaction.reflectionProvided ?? false,
      })),
    );

    if (format === "csv") {
      const csv = attemptsToCsv(flatAttempts);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="assignment-${assignmentId}-attempts.csv"`,
        },
      });
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      assignment: {
        id: assignment._id,
        title: assignment.title,
        description: assignment.description,
        totalQuestions: assignment.totalQuestions,
        allowedLevels: assignment.allowedLevels,
        timeLimitMinutes: assignment.timeLimitMinutes,
      },
      questions,
      attempts: flatAttempts,
      aiInteractions,
      aggregates: {
        totalAttempts: flatAttempts.length,
        averageHelpRequests:
          flatAttempts.length > 0
            ? flatAttempts.reduce((sum: number, a) => sum + a.totalHelpRequests, 0) / flatAttempts.length
            : 0,
        averageIndependenceScore:
          flatAttempts.length > 0
            ? flatAttempts.reduce((sum: number, a) => sum + (a.independenceScore ?? 0), 0) /
              flatAttempts.length
            : 0,
        totalAiInteractions: aiInteractions.length,
      },
    };

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="assignment-${assignmentId}-export.json"`,
      },
    });
  } catch (error: any) {
    return new Response(`Export failed: ${error?.message ?? "Unknown error"}`, { status: 500 });
  }
});

export const exportLecturerDataset = httpAction(async (ctx) => {
  try {
    await requireAuthFromAction(ctx);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const user = await ctx.runQuery(api.users.loggedInUserWithProfile, {});
  if (!user?.profile) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (user.profile.role !== "lecturer" && user.profile.role !== "organizationAdmin") {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const assignments = await ctx.runQuery(api.assignments.getLecturerAssignments, {});
    const payload = [];
    for (const assignment of assignments) {
      const attemptRows = await ctx.runQuery(api.analytics.getAssignmentAnalytics, {
        assignmentId: assignment._id,
      }) as AnalyticsAttemptRow[];
      payload.push({
        assignmentId: assignment._id,
        title: assignment.title,
        totalQuestions: assignment.totalQuestions,
        avgIndependenceScore: assignment.avgIndependenceScore,
        attempts: attemptRows.map((row: AnalyticsAttemptRow) => ({
          attemptId: row._id,
          studentId: row.studentId,
          questionId: row.questionId,
          startedAt: row.startedAt,
          submittedAt: row.submittedAt,
          isCorrect: row.isCorrect,
          totalHelpRequests: row.totalHelpRequests,
          helpLevelsUsed: row.helpLevelsUsed,
          independenceScore: row.independenceScore,
          cognitiveScore: row.cognitiveScore,
        })),
      });
    }

    return new Response(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          assignmentCount: assignments.length,
          assignments: payload,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="lecturer-export-${Date.now()}.json"`,
        },
      },
    );
  } catch (error: any) {
    return new Response(`Bulk export failed: ${error?.message ?? "Unknown error"}`, { status: 500 });
  }
});
