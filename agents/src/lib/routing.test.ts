import { describe, expect, it } from 'vitest';
import { convexSiteUrl, geminiProxyBaseUrl } from './llm.js';
import { resolveTopicUrl } from '../pubsub/index.js';
import { normalizeSubject, jsonFormatter } from '../tools/agent5_tools.js';

describe('convexSiteUrl', () => {
  it('derives the HTTP-actions URL from the deployment URL', () => {
    expect(convexSiteUrl({ CONVEX_URL: 'https://happy-cat-1.convex.cloud' })).toBe('https://happy-cat-1.convex.site');
    expect(convexSiteUrl({ CONVEX_URL: 'http://127.0.0.1:3210' })).toBe('http://127.0.0.1:3211');
    expect(convexSiteUrl({ CONVEX_URL: 'x', CONVEX_SITE_URL: 'https://custom.example/' })).toBe('https://custom.example');
    expect(geminiProxyBaseUrl({ CONVEX_URL: 'https://happy-cat-1.convex.cloud' })).toBe(
      'https://happy-cat-1.convex.site/api/gemini-proxy/',
    );
  });

  it('fails loudly when CONVEX_URL is missing (it used to build "undefined/api/...")', () => {
    expect(() => convexSiteUrl({})).toThrow(/CONVEX_URL is not set/);
  });
});

describe('resolveTopicUrl', () => {
  it('routes Agent 4 reports to Agent 6 batching and outputs to the Judge', () => {
    expect(resolveTopicUrl('student_report_ready', {})).toBe('http://localhost:8086/webhook/student_report_ready');
    expect(resolveTopicUrl('agent_output_produced', {})).toBe('http://localhost:8088/judge/output');
  });

  it('uses the per-service URL override (e.g. Cloud Run)', () => {
    expect(resolveTopicUrl('remediation_requested', { AGENT3_URL: 'https://agent3.run.app/' })).toBe(
      'https://agent3.run.app/webhook/remediation_requested',
    );
  });

  it('returns null for unknown topics', () => {
    expect(resolveTopicUrl('nope', {})).toBeNull();
  });
});

describe('Agent 5 formatting', () => {
  it('normalizes subjects', () => {
    expect(normalizeSubject('physics')).toBe('Physics');
    expect(normalizeSubject('Mathematics')).toBe('Math');
    expect(normalizeSubject('Biology')).toBeUndefined();
  });

  it('accepts common field-name variants and drops empty questions', () => {
    const out = jsonFormatter({
      questions: [{ question: 'Find v.', topic: 'Kinematics', subject: 'phys', answer: '5' }, { text: '  ' }],
      mapping_confidence_avg: 2,
    });
    expect(out.questions).toEqual([
      { text: 'Find v.', options: undefined, correct_answer: '5', mapped_topic: 'Kinematics', subject: 'Physics' },
    ]);
    expect(out.mapping_confidence_avg).toBe(1);
  });
});
