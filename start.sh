#!/bin/bash
source ~/.nvm/nvm.sh
echo "=== CogAIt Full Stack Launcher ==="
echo "Killing existing instances..."
lsof -ti:5173,8081,8082,8083,8084,8085,8086,8087,8088 | xargs kill -9 2>/dev/null || true
sleep 1

echo "Building agents..."
(cd agents && npm run build) || { echo "BUILD FAILED"; exit 1; }

echo "Starting all 8 agents..."
(cd agents && node --env-file=.env dist/agent1_socratic/index.js) &
(cd agents && node --env-file=.env dist/agent2_analyst/index.js) &
(cd agents && node --env-file=.env dist/agent3_content/index.js) &
(cd agents && node --env-file=.env dist/agent4_longterm/index.js) &
(cd agents && node --env-file=.env dist/agent5_ingestion/index.js) &
(cd agents && node --env-file=.env dist/agent6_cohort/index.js) &
(cd agents && node --env-file=.env dist/agent7_recommendation/index.js) &
(cd agents && node --env-file=.env dist/agent8_judge/index.js) &

echo "Starting CogAIt Frontend + Convex Backend..."
npm run dev:backend &
npm run dev:frontend
