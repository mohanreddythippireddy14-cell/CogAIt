import { describe, expect, it } from 'vitest';
import { detectPiiDetailed } from './pii_detector.js';
import { validateSchema } from './schema_validator.js';

describe('detectPiiDetailed', () => {
  it('detects emails, Indian mobile numbers and Aadhaar-style numbers', async () => {
    expect((await detectPiiDetailed('mail me at a.student@example.com')).hasPii).toBe(true);
    expect((await detectPiiDetailed('call 9876543210')).hasPii).toBe(true);
    expect((await detectPiiDetailed('+91 9876543210')).hasPii).toBe(true);
    expect((await detectPiiDetailed('aadhaar 2345 6789 0123')).hasPii).toBe(true);
  });

  it('does not treat physics and chemistry quantities as PII', async () => {
    for (const text of [
      'c = 3000000000 m/s so the light takes 500 s',
      'N_A = 602200000000000000000000 per mole',
      'the charge is 1602176634 e-28 C',
      'v = 12.3456789012 m/s',
    ]) {
      expect((await detectPiiDetailed(text)).hasPii, text).toBe(false);
    }
  });
});

describe('validateSchema', () => {
  it('rejects an empty weak_topics list for Agent 3', () => {
    expect(() =>
      validateSchema(
        { student_id: 's', weak_topics: [], remediation_preference: 'pyqs', time_available_minutes: 30 },
        'ContentAgentInput',
      ),
    ).toThrow(/at least 1 items/);
  });

  it('accepts null CIS windows in a student report', () => {
    const report = {
      student_id: 's',
      report_date: '2026-10-27',
      cis_trajectory: { week_1: null, month_1: 55, month_3: 60, year_1: null },
      topic_trends: [],
      at_risk: false,
      ai_dependency_flag: false,
      narrative_summary: 'ok',
    };
    expect(() => validateSchema(report, 'LongTermAnalystOutput')).not.toThrow();
  });

  it('requires a student_reports array for a cohort batch', () => {
    expect(() => validateSchema({ batch_id: 'b', report_date: '2026-10-27' }, 'CohortAnalystInput')).toThrow(
      /student_reports: must be an array/,
    );
  });
});
