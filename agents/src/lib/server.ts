import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import type { AuthVariables } from '../middleware/auth.js';

// Honour HTTP(S)_PROXY for outbound fetches (LLM proxy, Convex, other agents).
setGlobalDispatcher(new EnvHttpProxyAgent());

/**
 * Creates a Hono app with the CORS headers every agent needs.
 */
export function createAgentApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-Key');
    if (c.req.method === 'OPTIONS') return c.text('OK');
    await next();
  });
  app.get('/health', (c) => c.text('OK'));
  return app;
}

/**
 * Starts the service on $PORT (set by Cloud Run) or the agent's local default port.
 */
export function startAgentServer(app: { fetch: (req: Request) => Response | Promise<Response> }, name: string, defaultPort: number) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : defaultPort;
  console.log(`[${name}] Starting on port ${port}`);
  serve({ fetch: app.fetch, port });
}
