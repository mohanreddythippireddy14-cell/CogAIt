export const HELP_LEVELS = [1, 2, 3, 4] as const;

export const LEVEL_NAMES = {
  1: "Audit Mode",
  2: "Socratic Mode",
  3: "Instruction Mode",
  4: "Deep Assistance",
} as const;

export const INDEPENDENCE_THRESHOLDS = {
  highRisk: 40,
  mediumRisk: 60,
} as const;

export const VIOLATION_LIMITS = {
  autoSubmitViolations: 5,
} as const;

export const COGNITIVE_WEIGHTS = {
  correctness: 0.4,
  independence: 0.3,
  timeEfficiency: 0.2,
  thinkingTime: 0.1,
} as const;

export const DIFFICULTY_MULTIPLIERS = {
  easy: 0.8,
  medium: 1.0,
  hard: 1.2,
} as const;

export const TIME_EXPECTATIONS = {
  secondsPerQuestion: 240, // 4 minutes
} as const;

export const INDEPENDENCE_FORMULA = {
  maxHelpLevel: 4,
  questionBonus: 50,
  helpBonus: 50,
} as const;

// Guardrail contracts for dashboard rollups and API responses.
export const METRIC_CONTRACTS = {
  cisVersion: "CIS_v1",
  riskScoreVersion: "RiskScore_v1",
  rollupMetricVersion: "ROLLUP_v1",
  staleTtlMs: 5 * 60 * 1000, // 5 minutes
  driftMismatchThreshold: 0.05,
} as const;
