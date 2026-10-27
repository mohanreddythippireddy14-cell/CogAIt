import { describe, expect, it } from "vitest";
import { enforceHelpRequestPolicy } from "./aiService";

const MINUTE = 60 * 1000;
const now = 1_000_000_000;
const at = (msAgo: number) => ({ _creationTime: now - msAgo });

describe("enforceHelpRequestPolicy", () => {
  it("allows the first request", () => {
    expect(() => enforceHelpRequestPolicy({ recentHelp: [], now })).not.toThrow();
  });

  it("allows a request after the 30 s cooldown when under the window limit", () => {
    const recentHelp = [at(1 * MINUTE), at(2 * MINUTE), at(3 * MINUTE), at(4 * MINUTE)];
    expect(() => enforceHelpRequestPolicy({ recentHelp, now })).not.toThrow();
  });

  it("blocks a request within 30 s of the previous one", () => {
    expect(() => enforceHelpRequestPolicy({ recentHelp: [at(10_000)], now })).toThrow(/20s more to think/);
  });

  it("blocks the 6th request inside a 5-minute window and says when to retry", () => {
    const recentHelp = [at(0.5 * MINUTE), at(1 * MINUTE), at(2 * MINUTE), at(3 * MINUTE), at(4 * MINUTE)];
    expect(() => enforceHelpRequestPolicy({ recentHelp, now })).toThrow(/5 requests per 5 minutes.*try again in 60s/);
  });

  it("ignores requests older than the window", () => {
    const recentHelp = [at(1 * MINUTE), at(6 * MINUTE), at(7 * MINUTE), at(8 * MINUTE), at(9 * MINUTE)];
    expect(() => enforceHelpRequestPolicy({ recentHelp, now })).not.toThrow();
  });
});
