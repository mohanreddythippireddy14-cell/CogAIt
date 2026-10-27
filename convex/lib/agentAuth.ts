import { v } from "convex/values";

/**
 * Guard for functions that only the agent services may call (via ConvexHttpClient).
 * The agents pass `agentKey`, which must equal the AGENT_SECRET environment variable of
 * this deployment (`npx convex env set AGENT_SECRET ...`, same value as agents/.env).
 */
export const agentKeyArg = { agentKey: v.string() };

export function requireAgentKey(agentKey: string): void {
  const secret = process.env.AGENT_SECRET;
  if (!secret) {
    throw new Error("AGENT_SECRET is not set on this Convex deployment");
  }
  if (agentKey !== secret) {
    throw new Error("Unauthorized agent call");
  }
}
