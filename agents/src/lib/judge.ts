import type { EvalType, JudgeOutput } from '../types/index.js';

/**
 * Answer-leak patterns. Keep in sync with VIOLATION_PATTERNS in convex/domain/aiPolicy.ts,
 * which applies the same check to every tutor reply before it reaches the student.
 */
const LEAK_PATTERNS: Array<{ label: string; severity: 'high' | 'low'; patterns: RegExp[] }> = [
  {
    label: 'Contains final numerical answer',
    severity: 'high',
    patterns: [/\bfinal answer is\b/i, /\bthe answer is\s*-?\d+(\.\d+)?\b/i, /therefore[^\n]*=\s*-?\d+(\.\d+)?/i],
  },
  {
    label: 'Provides complete solution',
    severity: 'high',
    patterns: [/\bstep\s*1\b[\s\S]*\bstep\s*2\b/i, /\bsubstitute\b[\s\S]*\bsimplify\b[\s\S]*\bsolve\b/i],
  },
  {
    label: 'Confirms correctness directly',
    severity: 'low',
    patterns: [/\byes,\s*that's correct\b/i, /\byour answer is right\b/i, /\bthat is the correct\b/i],
  },
];

/** Agents whose output goes to students and must never leak answers. */
export const STUDENT_FACING_AGENTS = new Set(['Agent1']);

export interface Verdict {
  trace_id: string;
  agent: string;
  timestamp: string;
  passed: boolean;
  severity: 'none' | 'low' | 'high';
  violations: string[];
  llm_reason?: string;
}

export function checkAnswerLeaks(text: string): { violations: string[]; severity: Verdict['severity'] } {
  const hits = LEAK_PATTERNS.filter((group) => group.patterns.some((pattern) => pattern.test(text)));
  return {
    violations: hits.map((group) => group.label),
    severity: hits.some((group) => group.severity === 'high') ? 'high' : hits.length ? 'low' : 'none',
  };
}

/**
 * Combines the deterministic leak check (student-facing agents only) with the optional LLM
 * rubric verdict into one record.
 */
export function buildVerdict(params: {
  agent: string;
  traceId: string;
  outputText: string;
  llmVerdict?: { passed: boolean; reason: string } | null;
  now?: Date;
}): Verdict {
  const leaks = STUDENT_FACING_AGENTS.has(params.agent)
    ? checkAnswerLeaks(params.outputText)
    : { violations: [] as string[], severity: 'none' as const };
  const violations = [...leaks.violations];
  let severity: Verdict['severity'] = leaks.severity;
  if (params.llmVerdict && !params.llmVerdict.passed) {
    violations.push(`Rubric: ${params.llmVerdict.reason}`);
    if (severity === 'none') severity = 'low';
  }
  return {
    trace_id: params.traceId,
    agent: params.agent,
    timestamp: (params.now ?? new Date()).toISOString(),
    passed: violations.length === 0,
    severity,
    violations,
    llm_reason: params.llmVerdict?.reason,
  };
}

/** Alert when more than this share of the sampled outputs failed. */
export const ALERT_FAILURE_RATE = 0.2;

/** Scheduled evaluation over the most recent recorded verdicts of one agent. */
export function summarizeVerdicts(params: {
  verdicts: Verdict[];
  target: string;
  sampleSize: number;
  evaluationType: EvalType;
  now?: Date;
}): JudgeOutput {
  const sample = params.verdicts.filter((v) => v.agent === params.target).slice(-params.sampleSize);
  const failed = sample.filter((v) => !v.passed);
  const now = params.now ?? new Date();
  return {
    evaluation_id: `eval_${params.target}_${now.getTime()}`,
    timestamp: now.toISOString(),
    agent_evaluated: params.target,
    policy_violations_detected: failed.length,
    schema_failures_detected: 0,
    latency_anomaly: false,
    error_rate_anomaly: false,
    alert_fired: sample.length > 0 && failed.length / sample.length > ALERT_FAILURE_RATE,
    evaluation_details: sample.map((v) => ({
      pass: v.passed,
      reason: v.passed ? `${params.evaluationType}: ok` : v.violations.join('; '),
      trace_id: v.trace_id,
    })),
  };
}
