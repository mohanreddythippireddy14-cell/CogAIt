import { describe, expect, it } from 'vitest';
import { aggregateCohort, buildStudentReport, cisTrajectory, topicTrends, type HistoryEntry } from './analytics.js';
import type { LongTermAnalystOutput } from '../types/index.js';

const DAY = 24 * 60 * 60 * 1000;
const now = 400 * DAY;
const entry = (daysAgo: number, cis: number, topic = 'Kinematics', maxHelpLevel = 1, totalHelpRequests = 1): HistoryEntry => ({
  submittedAt: now - daysAgo * DAY,
  topic,
  cis,
  maxHelpLevel,
  totalHelpRequests,
});

describe('cisTrajectory', () => {
  it('averages each window and returns null for empty windows', () => {
    const history = [entry(2, 80), entry(20, 60), entry(200, 40)];
    expect(cisTrajectory(history, now)).toEqual({ week_1: 80, month_1: 70, month_3: 70, year_1: 60 });
    expect(cisTrajectory([], now)).toEqual({ week_1: null, month_1: null, month_3: null, year_1: null });
  });
});

describe('topicTrends', () => {
  it('compares the newer half with the older half of a topic', () => {
    const history = [entry(30, 40), entry(20, 45), entry(10, 70), entry(1, 80), entry(5, 50, 'Optics', 3)];
    const trends = topicTrends(history);
    expect(trends[0]).toEqual({ topic: 'Kinematics', trend: 'improving', avg_scaffold_depth: 1, sessions_count: 4 });
    expect(trends[1]).toMatchObject({ topic: 'Optics', trend: 'stable', avg_scaffold_depth: 3 });
  });
});

describe('buildStudentReport', () => {
  it('flags at-risk students (CIS below 40) and heavy help use', () => {
    const report = buildStudentReport('s1', '2026-10-27', [entry(1, 30, 'Optics', 4, 5)], now);
    expect(report.at_risk).toBe(true);
    expect(report.ai_dependency_flag).toBe(true);
  });

  it('does not flag a student with no history', () => {
    const report = buildStudentReport('s1', '2026-10-27', [], now);
    expect(report.at_risk).toBe(false);
    expect(report.ai_dependency_flag).toBe(false);
  });
});

describe('aggregateCohort', () => {
  const report = (id: string, week: number | null, depth: number, atRisk = false): LongTermAnalystOutput => ({
    student_id: id,
    report_date: '2026-10-27',
    cis_trajectory: { week_1: week, month_1: 70, month_3: 70, year_1: 70 },
    topic_trends: [{ topic: 'Optics', trend: 'stable', avg_scaffold_depth: depth, sessions_count: 2 }],
    at_risk: atRisk,
    ai_dependency_flag: depth >= 3,
    narrative_summary: 'n/a',
  });

  it('reports topics failing for more than 40% of students, at-risk and dependent students', () => {
    const cohort = aggregateCohort('a1', '2026-10-27', [
      report('s1', 30, 4, true),
      report('s2', 50, 3),
      report('s3', 80, 1),
      report('s4', 90, 1),
      report('s5', null, 1),
    ]);
    expect(cohort.failing_topics).toEqual([]); // 2 of 5 = 40%, not above 40%
    expect(cohort.at_risk_students.map((s) => s.student_id)).toEqual(['s1']);
    expect(cohort.ai_dependency_students).toEqual(['s1', 's2']);
    expect(cohort.cohort_cis_avg).toBe(64); // (30+50+80+90+70)/5
    expect(cohort.cohort_cis_trend).toBe('declining'); // weekly 62.5 vs monthly 70: more than 5 points down
  });

  it('marks a topic as failing above the 40% share', () => {
    const cohort = aggregateCohort('a1', '2026-10-27', [report('s1', 50, 3), report('s2', 50, 3), report('s3', 50, 1)]);
    expect(cohort.failing_topics).toEqual([{ topic: 'Optics', failure_rate_pct: 67, avg_scaffold_depth: 2.3 }]);
    expect(cohort.cohort_cis_trend).toBe('declining'); // 50 vs 70
  });
});
