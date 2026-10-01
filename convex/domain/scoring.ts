import { INDEPENDENCE_THRESHOLDS } from "../constants";

export type Difficulty = "easy" | "medium" | "hard";

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export function getDifficultyMultiplier(difficulty: Difficulty): number {
  if (difficulty === "hard") return 1.2;
  if (difficulty === "medium") return 1.1;
  return 1;
}

export function computeFinalIndependenceScore(params: {
  attempts: Array<{
    submittedAt?: number;
    startedAt: number;
    studentAnswer?: string;
    isCorrect?: boolean;
    totalHelpRequests: number;
  }>;
  expectedMsPerQuestion: number;
}) {
  const gradedAttempts = params.attempts.filter((attempt) => attempt.submittedAt !== undefined);
  if (gradedAttempts.length === 0) {
    return { finalScore: 0, gradedCount: 0 };
  }

  const scores = gradedAttempts.map((attempt) => {
    const hasAnswer = (attempt.studentAnswer ?? "").trim().length > 0;
    const correctnessScore = !hasAnswer
      ? 0
      : attempt.isCorrect === true
        ? 100
        : attempt.isCorrect === false
          ? 25
          : 50;
    const helpPenalty = Math.min(attempt.totalHelpRequests * 12, 60);
    const helpScore = Math.max(0, 100 - helpPenalty);
    const elapsedMs = (attempt.submittedAt ?? attempt.startedAt) - attempt.startedAt;
    const timeScore = Math.max(
      0,
      Math.min(100, (params.expectedMsPerQuestion / Math.max(1, elapsedMs)) * 100),
    );
    return correctnessScore * 0.5 + helpScore * 0.35 + timeScore * 0.15;
  });

  const finalScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  return { finalScore: clampScore(finalScore), gradedCount: gradedAttempts.length };
}

export function computeCognitiveScore(params: {
  isCorrect?: boolean;
  independenceScore?: number;
  elapsedMs: number;
  assignmentLimitMs: number;
  timeSpentBeforeFirstHelp?: number;
  difficulty: Difficulty;
}) {
  const correctness = params.isCorrect ? 100 : 0;
  const independence = params.independenceScore ?? 0;
  const timeEfficiency = clampScore(100 - (params.elapsedMs / params.assignmentLimitMs) * 100);
  const firstHelpThinking = params.timeSpentBeforeFirstHelp ?? params.elapsedMs;
  const baselineThinkingMs = 5 * 60 * 1000;
  const thinkingTimeScore = clampScore((firstHelpThinking / baselineThinkingMs) * 100);

  const weightedBase =
    correctness * 0.4 +
    independence * 0.3 +
    timeEfficiency * 0.2 +
    thinkingTimeScore * 0.1;
  const adjusted = clampScore(weightedBase * getDifficultyMultiplier(params.difficulty));
  return Math.round(adjusted);
}

export type RiskLevel = "high" | "medium" | "low";

export function riskFromIndependence(independenceScore: number): RiskLevel {
  if (independenceScore < INDEPENDENCE_THRESHOLDS.highRisk) return "high";
  if (independenceScore < INDEPENDENCE_THRESHOLDS.mediumRisk) return "medium";
  return "low";
}

export function recommendedActionForRisk(riskLevel: RiskLevel): string {
  if (riskLevel === "high") {
    return "Schedule direct intervention and require level 1-2 support first.";
  }
  if (riskLevel === "medium") {
    return "Monitor closely and nudge independent reasoning checkpoints.";
  }
  return "Maintain current support; continue periodic review.";
}

export function computeCisPerQuestion(params: {
  totalHelpRequests: number;
  helpLevelsUsed: number[];
  reasoningCharCountBeforeFirstHelp?: number;
  fallbackReasoningLength?: number;
}): number {
  const base = 100;
  const maxHelpLevelUsed = params.helpLevelsUsed.length > 0 ? Math.max(...params.helpLevelsUsed) : 0;
  const helpLevelPenalty = maxHelpLevelUsed * 15;
  const helpCountPenalty = Math.max(0, params.totalHelpRequests) * 5;
  const reasoningChars = params.reasoningCharCountBeforeFirstHelp ?? params.fallbackReasoningLength ?? 0;
  const reasoningBonus = reasoningChars > 50 ? 10 : 0;
  return clampScore(base - helpLevelPenalty - helpCountPenalty + reasoningBonus);
}

export function computeOverallCis(
  attempts: Array<{
    submittedAt?: number;
    studentAnswer?: string;
    totalHelpRequests: number;
    helpLevelsUsed: number[];
    reasoningCharCountBeforeFirstHelp?: number;
    studentReasoning?: string;
  }>,
): number {
  const graded = attempts.filter((attempt) => attempt.submittedAt !== undefined);
  if (graded.length === 0) {
    return 0;
  }
  const total = graded.reduce(
    (sum, attempt) =>
      sum +
      ((attempt.studentAnswer ?? "").trim().length > 0
        ? computeCisPerQuestion({
            totalHelpRequests: attempt.totalHelpRequests,
            helpLevelsUsed: attempt.helpLevelsUsed,
            reasoningCharCountBeforeFirstHelp: attempt.reasoningCharCountBeforeFirstHelp,
            fallbackReasoningLength: attempt.studentReasoning?.length ?? 0,
          })
        : 0),
    0,
  );
  return Math.round(total / graded.length);
}
    