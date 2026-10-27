import { afterEach, describe, expect, it } from "vitest";
import { requireAgentKey } from "./agentAuth";

describe("requireAgentKey", () => {
  const original = process.env.AGENT_SECRET;
  afterEach(() => {
    process.env.AGENT_SECRET = original;
  });

  it("refuses every call when AGENT_SECRET is not configured", () => {
    delete process.env.AGENT_SECRET;
    expect(() => requireAgentKey("")).toThrow(/not set/);
  });

  it("rejects a wrong key and accepts the right one", () => {
    process.env.AGENT_SECRET = "s3cret";
    expect(() => requireAgentKey("nope")).toThrow(/Unauthorized/);
    expect(() => requireAgentKey("s3cret")).not.toThrow();
  });
});
