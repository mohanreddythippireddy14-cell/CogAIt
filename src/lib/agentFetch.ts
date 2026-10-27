/**
 * Headers for browser calls to the agent services. Agents verify the Convex Auth token
 * and take the caller's user id from it (see agents/src/middleware/auth.ts).
 */
export function agentHeaders(authToken: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}
