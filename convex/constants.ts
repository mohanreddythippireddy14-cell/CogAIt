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

// Score formulas (independence, CIS_v1, cognitive score) live in domain/scoring.ts.

// Guardrail contracts for dashboard rollups and API responses.
export const METRIC_CONTRACTS = {
  cisVersion: "CIS_v1",
  riskScoreVersion: "RiskScore_v1",
  rollupMetricVersion: "ROLLUP_v1",
  staleTtlMs: 5 * 60 * 1000, // 5 minutes
  driftMismatchThreshold: 0.05,
} as const;
