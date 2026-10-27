import type { CohortAnalystOutput, LongTermAnalystOutput, TopicTrend, TrendDirection } from '../types/index.js';

/**
 * Deterministic analytics used by Agent 4 (student report) and Agent 6 (cohort report).
 * Pure functions: no I/O, so they are unit-tested in analytics.test.ts.
 */

export interface HistoryEntry {
  submittedAt: number;
  topic: string;
  totalHelpRequests: number;
  maxHelpLevel: number;
  cis: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const CIS_WINDOWS = { week_1: 7, month_1: 30, month_3: 90, year_1: 365 } as const;
export const AT_RISK_CIS = 40; // same threshold as INDEPENDENCE_THRESHOLDS.highRisk in convex/constants.ts
export const TREND_DELTA = 5; // CIS points
export const MIN_COHORT_SIZE = 5;
export const FAILING_TOPIC_SHARE_PCT = 40;

const round1 = (value: number) => Math.round(value * 10) / 10;
const mean = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);

function trendOf(delta: number): TrendDirection {
  if (delta > TREND_DELTA) return 'improving';
  if (delta < -TREND_DELTA) return 'declining';
  return 'stable';
}

/** Average CIS per time window; null when the student has no submitted attempt in it. */
export function cisTrajectory(history: HistoryEntry[], now: number): LongTermAnalystOutput['cis_trajectory'] {
  const result = {} as LongTermAnalystOutput['cis_trajectory'];
  for (const [key, days] of Object.entries(CIS_WINDOWS) as Array<[keyof typeof CIS_WINDOWS, number]>) {
    const inWindow = history.filter((entry) => entry.submittedAt >= now - days * DAY_MS).map((entry) => entry.cis);
    result[key] = inWindow.length ? round1(mean(inWindow)) : null;
  }
  return result;
}

/** Per-topic help depth and trend (newer half vs older half of the topic's attempts). */
export function topicTrends(history: HistoryEntry[]): TopicTrend[] {
  const byTopic = new Map<string, HistoryEntry[]>();
  for (const entry of history) {
    byTopic.set(entry.topic, [...(byTopic.get(entry.topic) ?? []), entry]);
  }
  return [...byTopic.entries()]
    .map(([topic, entries]) => {
      const ordered = [...entries].sort((a, b) => a.submittedAt - b.submittedAt);
      const half = Math.floor(ordered.length / 2);
      const delta =
        ordered.length >= 2 ? mean(ordered.slice(half).map((e) => e.cis)) - mean(ordered.slice(0, half).map((e) => e.cis)) : 0;
      return {
        topic,
        trend: trendOf(delta),
        avg_scaffold_depth: round1(mean(ordered.map((e) => e.maxHelpLevel))),
        sessions_count: ordered.length,
      };
    })
    .sort((a, b) => b.sessions_count - a.sessions_count);
}

/** Most recent non-empty CIS window value. */
export function latestCis(trajectory: LongTermAnalystOutput['cis_trajectory']): number | null {
  return trajectory.week_1 ?? trajectory.month_1 ?? trajectory.month_3 ?? trajectory.year_1;
}

/** Everything in the student report except the LLM-written narrative. */
export function buildStudentReport(
  studentId: string,
  reportDate: string,
  history: HistoryEntry[],
  now: number,
): Omit<LongTermAnalystOutput, 'narrative_summary'> {
  const trajectory = cisTrajectory(history, now);
  const lastMonth = history.filter((entry) => entry.submittedAt >= now - 30 * DAY_MS);
  const current = latestCis(trajectory);
  return {
    student_id: studentId,
    report_date: reportDate,
    cis_trajectory: trajectory,
    topic_trends: topicTrends(history),
    at_risk: current !== null && current < AT_RISK_CIS,
    ai_dependency_flag:
      lastMonth.length > 0 &&
      (mean(lastMonth.map((e) => e.totalHelpRequests)) >= 3 || mean(lastMonth.map((e) => e.maxHelpLevel)) >= 3),
  };
}

/** Cohort-level patterns from individual student reports (Agent 6). */
export function aggregateCohort(
  batchId: string,
  reportDate: string,
  reports: LongTermAnalystOutput[],
): CohortAnalystOutput {
  const topicStats = new Map<string, { students: number; failing: number; depths: number[] }>();
  for (const report of reports) {
    for (const trend of report.topic_trends) {
      const stats = topicStats.get(trend.topic) ?? { students: 0, failing: 0, depths: [] };
      stats.students += 1;
      if (trend.trend === 'declining' || trend.avg_scaffold_depth >= 3) stats.failing += 1;
      stats.depths.push(trend.avg_scaffold_depth);
      topicStats.set(trend.topic, stats);
    }
  }
  const failingTopics = [...topicStats.entries()]
    .map(([topic, stats]) => ({
      topic,
      failure_rate_pct: Math.round((stats.failing / stats.students) * 100),
      avg_scaffold_depth: round1(mean(stats.depths)),
    }))
    .filter((topic) => topic.failure_rate_pct > FAILING_TOPIC_SHARE_PCT)
    .sort((a, b) => b.failure_rate_pct - a.failure_rate_pct);

  const latest = reports.map((r) => latestCis(r.cis_trajectory)).filter((v): v is number => v !== null);
  const weekly = reports.map((r) => r.cis_trajectory.week_1).filter((v): v is number => v !== null);
  const monthly = reports.map((r) => r.cis_trajectory.month_1).filter((v): v is number => v !== null);

  return {
    batch_id: batchId,
    report_date: reportDate,
    failing_topics: failingTopics,
    at_risk_students: reports
      .filter((r) => r.at_risk)
      .map((r) => ({ student_id: r.student_id, reason: `CIS ${latestCis(r.cis_trajectory)} is below ${AT_RISK_CIS}` })),
    ai_dependency_students: reports.filter((r) => r.ai_dependency_flag).map((r) => r.student_id),
    cohort_cis_avg: round1(mean(latest)),
    cohort_cis_trend: weekly.length && monthly.length ? trendOf(mean(weekly) - mean(monthly)) : 'stable',
  };
}
