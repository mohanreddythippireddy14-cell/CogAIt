import { describe, expect, it } from 'vitest';
import { buildVerdict, checkAnswerLeaks, summarizeVerdicts, type Verdict } from './judge.js';

describe('checkAnswerLeaks', () => {
  it('flags final answers and full solutions as high severity', () => {
    expect(checkAnswerLeaks('So the answer is 42.')).toEqual({ violations: ['Contains final numerical answer'], severity: 'high' });
    expect(checkAnswerLeaks('Step 1: write F = ma. Step 2: solve.').severity).toBe('high');
  });

  it('flags direct confirmation as low severity and passes a Socratic question', () => {
    expect(checkAnswerLeaks("Yes, that's correct!").severity).toBe('low');
    expect(checkAnswerLeaks('What relationship connects force and acceleration here?')).toEqual({ violations: [], severity: 'none' });
  });
});

describe('buildVerdict', () => {
  it('applies the leak check to the student-facing tutor only', () => {
    expect(buildVerdict({ agent: 'Agent1', traceId: 't', outputText: 'The answer is 5' }).passed).toBe(false);
    expect(buildVerdict({ agent: 'Agent7', traceId: 't', outputText: 'The answer is 5' }).passed).toBe(true);
  });

  it('records a failed rubric verdict', () => {
    const verdict = buildVerdict({
      agent: 'Agent7',
      traceId: 't',
      outputText: 'Study more.',
      llmVerdict: { passed: false, reason: 'generic advice' },
    });
    expect(verdict).toMatchObject({ passed: false, severity: 'low', violations: ['Rubric: generic advice'] });
  });
});

describe('summarizeVerdicts', () => {
  const verdict = (agent: string, passed: boolean, id: string): Verdict => ({
    trace_id: id,
    agent,
    timestamp: '2026-10-27T00:00:00.000Z',
    passed,
    severity: passed ? 'none' : 'high',
    violations: passed ? [] : ['Contains final numerical answer'],
  });

  it('summarizes the most recent sample of the target agent and fires an alert above 20% failures', () => {
    const verdicts = [verdict('Agent1', false, 'old'), verdict('Agent7', false, 'x'), verdict('Agent1', true, 'a'), verdict('Agent1', false, 'b')];
    const out = summarizeVerdicts({ verdicts, target: 'Agent1', sampleSize: 2, evaluationType: 'policy_violation' });
    expect(out.agent_evaluated).toBe('Agent1');
    expect(out.evaluation_details.map((d) => d.trace_id)).toEqual(['a', 'b']);
    expect(out.policy_violations_detected).toBe(1);
    expect(out.alert_fired).toBe(true);
  });

  it('does not alert with no recorded outputs', () => {
    const out = summarizeVerdicts({ verdicts: [], target: 'Agent1', sampleSize: 10, evaluationType: 'policy_violation' });
    expect(out.alert_fired).toBe(false);
    expect(out.evaluation_details).toEqual([]);
  });
});
