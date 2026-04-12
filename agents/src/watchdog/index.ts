import { Hono } from 'hono';

const app = new Hono();

// Used by the external dumb cron job to verify Agent 8's health
app.get('/health', (c) => {
  return c.text('OK', 200);
});


import { serve } from '@hono/node-server';

const port = process.env.PORT ? parseInt(process.env.PORT) : 8089;
console.log(`[watchdog] Starting on port ${port}`);
serve({
  fetch: app.fetch,
  port,
});

export default app;
