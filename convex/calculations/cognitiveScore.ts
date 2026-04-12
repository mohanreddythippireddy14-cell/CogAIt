import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { computeCognitiveScore } from "../domain/scoring";

export const calculateAndPatchCognitiveScore = internalMutation({
  args: {
    attemptId: v.id("attempts"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) {
      throw new Error("Attempt not found");
    }

    const assignment = await ctx.db.get(attempt.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }

    const question = await ctx.db.get(attempt.questionId);
    if (!question) {
      throw new Error("Question not found");
    }

    const elapsedMs = (attempt.submittedAt ?? Date.now()) - attempt.startedAt;
    const assignmentLimitMs = assignment.timeLimitMinutes * 60 * 1000;
    const cognitiveScore = computeCognitiveScore({
      isCorrect: attempt.isCorrect,
      independenceScore: attempt.independenceScore,
      elapsedMs,
      assignmentLimitMs,
      timeSpentBeforeFirstHelp: attempt.timeSpentBeforeFirstHelp,
      difficulty: question.difficulty,
    });

    await ctx.db.patch(args.attemptId, {
      cognitiveScore,
    });

    return cognitiveScore;
  },
});
