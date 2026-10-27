import fs from 'fs';
import path from 'path';

// Generates one Dockerfile + Cloud Build config per agent service.
// Re-run with `node generate_deployment_files.mjs` after adding a service.
const services = [
  { file: 'Agent1', name: 'agent1_socratic', entry: 'agent1_socratic/index.js' },
  { file: 'Agent2', name: 'agent2_analyst', entry: 'agent2_analyst/index.js' },
  { file: 'Agent3', name: 'agent3_content', entry: 'agent3_content/index.js' },
  { file: 'Agent4', name: 'agent4_longterm', entry: 'agent4_longterm/index.js' },
  { file: 'Agent5', name: 'agent5_ingestion', entry: 'agent5_ingestion/index.js' },
  { file: 'Agent6', name: 'agent6_cohort', entry: 'agent6_cohort/index.js' },
  { file: 'Agent7', name: 'agent7_recommendation', entry: 'agent7_recommendation/index.js' },
  { file: 'Agent8', name: 'agent8_judge', entry: 'agent8_judge/index.js' },
  { file: 'Negotiation', name: 'negotiation_node', entry: 'middleware/negotiation_node.js' },
];

for (const service of services) {
  const dockerContent = `FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

# Cloud Run sets PORT; every service reads it (see src/lib/server.ts).
EXPOSE 8080
ENV PORT=8080

CMD ["node", "dist/${service.entry}"]
`;

  fs.writeFileSync(path.join('docker', `${service.file}.Dockerfile`), dockerContent);

  // Requests are authenticated in the app (X-Agent-Key or a Convex user token), so the
  // service accepts unauthenticated invocations at the Cloud Run level. Set CONVEX_URL,
  // GOOGLE_API_KEY, AGENT_SECRET and the AGENTn_URL/NEGOTIATION_URL routes on each service.
  const serviceName = `cogait-${service.name.replace(/_/g, '-')}`;
  const cloudBuildContent = `steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/\$PROJECT_ID/${serviceName}', '-f', 'docker/${service.file}.Dockerfile', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/\$PROJECT_ID/${serviceName}']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args: ['run', 'deploy', '${serviceName}', '--image', 'gcr.io/\$PROJECT_ID/${serviceName}', '--region', 'us-central1', '--platform', 'managed', '--allow-unauthenticated']
options:
  logging: CLOUD_LOGGING_ONLY
`;

  fs.writeFileSync(path.join('deploy', `cloudbuild-${service.file.toLowerCase()}.yaml`), cloudBuildContent);
}

console.log('Generated Dockerfiles and Cloud Build configs.');
