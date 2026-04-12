import type { Context, Next } from 'hono';

const AGENT_SECRET = process.env.AGENT_SECRET || 'cogait_dev_secret_2026';

/**
 * Middleware that validates a shared secret header.
 * In production, replace with GCP IAM service-to-service auth.
 */
export const authMiddleware = async (c: Context, next: Next) => {
  // Allow preflight CORS
  if (c.req.method === 'OPTIONS') {
    return next();
  }

  const providedKey = c.req.header('X-Agent-Key');
  
  // In local dev, allow requests without key for easier testing
  // but log a warning
  if (!providedKey) {
    console.warn(`[Auth] No X-Agent-Key header provided for ${c.req.url} — allowing in dev mode`);
    return next();
  }

  if (providedKey !== AGENT_SECRET) {
    return c.json({ error: 'Unauthorized: Invalid agent key' }, 401);
  }

  return next();
};
