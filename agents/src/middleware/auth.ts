import type { Context, Next } from 'hono';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { convexSiteUrl } from '../lib/llm.js';

/**
 * Two kinds of caller reach the agents:
 * - other services (agents, the pub/sub bridge, Convex): send `X-Agent-Key: <AGENT_SECRET>`;
 * - the browser (student/lecturer UI): sends `Authorization: Bearer <Convex Auth JWT>`.
 *
 * In production, replace the shared secret with GCP IAM service-to-service auth.
 */
export type AuthVariables = { callerUserId?: string; callerIsService: boolean };

export function getAgentSecret(): string {
  const secret = process.env.AGENT_SECRET;
  if (!secret) {
    throw new Error('AGENT_SECRET is not set. Copy agents/.env.example to agents/.env and fill it in.');
  }
  return secret;
}

/** Headers to attach to every service-to-service request. */
export function agentKeyHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Agent-Key': getAgentSecret() };
}

function hasValidAgentKey(c: Context): boolean {
  const provided = c.req.header('X-Agent-Key');
  return Boolean(provided) && provided === getAgentSecret();
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

/**
 * Verifies a Convex Auth JWT against the deployment's public keys and returns the user id
 * (`sub` is `<userId>|<sessionId>`).
 */
export async function verifyConvexUserToken(token: string): Promise<string> {
  const issuer = convexSiteUrl();
  if (!jwks) jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'convex' });
  const userId = String(payload.sub ?? '').split('|')[0];
  if (!userId) throw new Error('Token has no subject');
  return userId;
}

/** Service-to-service routes: require the shared agent key. */
export const requireAgentKey = async (c: Context, next: Next) => {
  try {
    if (!hasValidAgentKey(c)) return c.json({ error: 'Unauthorized: missing or invalid X-Agent-Key' }, 401);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
  c.set('callerIsService', true);
  return next();
};

/**
 * Browser-facing routes: accept the agent key or a signed-in Convex user. Handlers must use
 * `c.get('callerUserId')` instead of trusting ids in the request body.
 */
export const requireAgentKeyOrUser = async (c: Context, next: Next) => {
  try {
    if (hasValidAgentKey(c)) {
      c.set('callerIsService', true);
      return next();
    }
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return c.json({ error: 'Unauthorized: sign in required' }, 401);
  try {
    c.set('callerUserId', await verifyConvexUserToken(token));
    c.set('callerIsService', false);
  } catch {
    return c.json({ error: 'Unauthorized: invalid session token' }, 401);
  }
  return next();
};
