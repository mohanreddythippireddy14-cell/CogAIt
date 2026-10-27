import { createAgentApp, startAgentServer } from '../lib/server.js';

// Used by an external cron job to check that the agent host is up (GET /health).
const app = createAgentApp();

startAgentServer(app, 'watchdog', 8090);

export default app;
