import { HELP_LEVELS } from "../constants";

export const TEXT_RATE_LIMIT = {
  windowMs: 5 * 60 * 1000,
  maxRequestsPerWindow: 5,
  cooldownMs: 30 * 1000,
} as const;

export const RESPONSE_REGENERATION_LIMIT = 3;

export const VIOLATION_PATTERNS = {
  finalAnswer: [
    /\bfinal answer is\b/i,
    /\bthe answer is\s*-?\d+(\.\d+)?\b/i,
    /therefore[^\n]*=\s*-?\d+(\.\d+)?/i,
  ],
  fullSolution: [
    /\bstep\s*1\b[\s\S]*\bstep\s*2\b/i,
    /\bsubstitute\b[\s\S]*\bsimplify\b[\s\S]*\bsolve\b/i,
  ],
  directConfirmation: [
    /\byes,\s*that's correct\b/i,
    /\byour answer is right\b/i,
    /\bthat is the correct\b/i,
  ],
} as const;

export function isValidHelpLevel(helpLevel: number): helpLevel is (typeof HELP_LEVELS)[number] {
  return HELP_LEVELS.includes(helpLevel as (typeof HELP_LEVELS)[number]);
}

export function validateAiResponse(
  response: string,
  helpLevel: (typeof HELP_LEVELS)[number],
): {
  valid: boolean;
  violations: string[];
  severity: "low" | "high";
} {
  const violations: string[] = [];

  for (const pattern of VIOLATION_PATTERNS.finalAnswer) {
    if (pattern.test(response)) {
      violations.push("Contains final numerical answer");
      break;
    }
  }
  for (const pattern of VIOLATION_PATTERNS.fullSolution) {
    if (pattern.test(response)) {
      violations.push("Provides complete solution");
      break;
    }
  }
  for (const pattern of VIOLATION_PATTERNS.directConfirmation) {
    if (pattern.test(response)) {
      violations.push("Confirms correctness directly");
      break;
    }
  }
  if (helpLevel <= 2 && response.length > 500) {
    violations.push("Response too detailed for help level");
  }

  const severity = violations.some(
    (v) => v.includes("final numerical answer") || v.includes("complete solution"),
  )
    ? "high"
    : "low";

  return {
    valid: violations.length === 0,
    violations,
    severity,
  };
}

export function getAiFallbackResponse(helpLevel: (typeof HELP_LEVELS)[number]): string {
  if (helpLevel === 1) {
    return "What principle best applies first, and why?";
  }
  if (helpLevel === 2) {
    return "What relationship connects the quantities you already identified?";
  }
  if (helpLevel === 3) {
    return "What is your first concrete step before any calculation?";
  }
  return "Show your next step and justify why it follows.";
}

export function shouldRequireReflection(latestInteraction: { reflectionProvided?: boolean } | null) {
  return Boolean(latestInteraction && latestInteraction.reflectionProvided !== true);
}

export function getRecentHelpCount(
  history: Array<{ _creationTime: number }>,
  now: number,
  windowMs: number = TEXT_RATE_LIMIT.windowMs,
) {
  const fromTs = now - windowMs;
  return history.filter((entry) => entry._creationTime >= fromTs).length;
}

export function isRateLimitedByWindow(recentCount: number) {
  return recentCount >= TEXT_RATE_LIMIT.maxRequestsPerWindow;
}

export function getCooldownRemainingMs(latestCreatedAt: number | null, now: number) {
  if (!latestCreatedAt) return 0;
  return Math.max(0, TEXT_RATE_LIMIT.cooldownMs - (now - latestCreatedAt));
}

export function getIntermediateCalculationsUsed(
  history: Array<{
    helpLevel: number;
    aiResponse: string;
  }>,
): number {
  return history.filter(
    (item) =>
      item.helpLevel === 4 &&
      (item.aiResponse.includes("=") ||
        /\b\d+\s*[\+\-\*\/xX]\s*\d+\b/.test(item.aiResponse)),
  ).length;
}
