import { describe, expect, it } from "vitest";
import {
  computeCisPerQuestion,
  computeCognitiveScore,
  computeFinalIndependenceScore,
  computeOverallCis,
  riskFromIndependence,
} from "./scoring";

describe("CIS_v1 (docs/CIS_SPEC.md)", () => {
  it("is 100 with no help and short reasoning", () => {
    expect(computeCisPerQuestion({ totalHelpRequests: 0, helpLevelsUsed: [] })).toBe(100);
  });

  it("subtracts 15 per max level and 5 per request, adds 10 for >50 reasoning chars", () => {
    // 100 - 3*15 - 2*5 + 10 = 55
    expect(
      computeCisPerQuestion({ totalHelpRequests: 2, helpLevelsUsed: [1, 3], reasoningCharCountBeforeFirstHelp: 80 }),
    ).toBe(55);
  });

  it("clamps to 0", () => {
    expect(computeCisPerQuestion({ totalHelpRequests: 20, helpLevelsUsed: [4] })).toBe(0);
  });

  it("averages submitted attempts and scores unanswered ones as 0", () => {
    const attempts = [
      { submittedAt: 1, studentAnswer: "42", totalHelpRequests: 0, helpLevelsUsed: [] },
      { submittedAt: 1, studentAnswer: "", totalHelpRequests: 0, helpLevelsUsed: [] },
      { totalHelpRequests: 0, helpLevelsUsed: [] }, // not submitted: ignored
    ];
    expect(computeOverallCis(attempts)).toBe(50);
  });
});

describe("independence score", () => {
  it("weights correctness 0.5, help 0.35, time 0.15", () => {
    const { finalScore } = computeFinalIndependenceScore({
      attempts: [{ startedAt: 0, submittedAt: 60_000, studentAnswer: "x", isCorrect: true, totalHelpRequests: 1 }],
      expectedMsPerQuestion: 60_000,
    });
    // 100*0.5 + (100-12)*0.35 + 100*0.15 = 95.8 -> 96
    expect(finalScore).toBe(96);
  });
});

describe("cognitive score", () => {
  it("applies the difficulty multiplier (easy 1.0, medium 1.1, hard 1.2)", () => {
    const base = { isCorrect: true, independenceScore: 50, elapsedMs: 0, assignmentLimitMs: 1, timeSpentBeforeFirstHelp: 0 };
    // 100*0.4 + 50*0.3 + 100*0.2 + 0*0.1 = 75
    expect(computeCognitiveScore({ ...base, difficulty: "easy" })).toBe(75);
    expect(computeCognitiveScore({ ...base, difficulty: "medium" })).toBe(83);
    expect(computeCognitiveScore({ ...base, difficulty: "hard" })).toBe(90);
  });
});

describe("risk bands", () => {
  it("uses the 40/60 thresholds", () => {
    expect(riskFromIndependence(39)).toBe("high");
    expect(riskFromIndependence(40)).toBe("medium");
    expect(riskFromIndependence(60)).toBe("low");
  });
});
