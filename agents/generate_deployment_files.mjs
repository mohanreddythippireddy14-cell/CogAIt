import fs from 'fs';
import path from 'path';

const agents = [
  { id: 1, name: 'agent1_socratic' },
  { id: 2, name: 'agent2_analyst' },
  { id: 3, name: 'agent3_content' },
  { id: 4, name: 'agent4_longterm' },
  { id: 5, name: 'agent5_ingestion' },
  { id: 6, name: 'agent6_cohort' },
  { id: 7, name: 'agent7_recommendation' },
  { id: 8, name: 'agent8_judge' },
];

for (const agent of agents) {
  const dockerContent = `FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 8080
ENV PORT=8080

CMD ["node", "dist/${agent.name}/index.js"]
`;

  fs.writeFileSync(path.join('docker', `Agent${agent.id}.Dockerfile`), dockerContent);

  const cloudBuildContent = `steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/\\$PROJECT_ID/cogait-${agent.name}', '-f', 'docker/Agent${agent.id}.Dockerfile', '.']
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/\\$PROJECT_ID/cogait-${agent.name}']
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args: ['run', 'deploy', 'cogait-${agent.name}', '--image', 'gcr.io/\\$PROJECT_ID/cogait-${agent.name}', '--region', 'us-central1', '--platform', 'managed', '--allow-unauthenticated']
options:
  logging: CLOUD_LOGGING_ONLY
`;

  fs.writeFileSync(path.join('deploy', `cloudbuild-agent${agent.id}.yaml`), cloudBuildContent);
}

console.log('Successfully generated Dockerfiles and cloudbuild yamls.');
