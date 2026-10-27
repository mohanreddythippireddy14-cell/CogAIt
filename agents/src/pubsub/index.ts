import { agentKeyHeaders } from '../middleware/auth.js';

/**
 * Lightweight event bus: each topic is delivered as an authenticated HTTP POST to the
 * service that consumes it (fire-and-forget). It stands in for Google Cloud Pub/Sub.
 *
 * Locally every service runs on localhost with its default port. When services run
 * elsewhere (e.g. Cloud Run), set the service's base URL, e.g. AGENT6_URL=https://....
 */
interface Route {
  service: string; // env var prefix: <service>_URL
  defaultPort: number;
  endpoint: string;
}

export const TOPIC_ROUTES: Record<string, Route> = {
  session_ended: { service: 'AGENT2', defaultPort: 8082, endpoint: '/webhook/session_ended' },
  weak_topics_identified: { service: 'NEGOTIATION', defaultPort: 8089, endpoint: '/webhook/weak_topics_identified' },
  remediation_offer_ready: { service: 'NEGOTIATION', defaultPort: 8089, endpoint: '/webhook/remediation_offer_ready' },
  remediation_declined: { service: 'NEGOTIATION', defaultPort: 8089, endpoint: '/webhook/remediation_declined' },
  remediation_postponed: { service: 'NEGOTIATION', defaultPort: 8089, endpoint: '/webhook/remediation_postponed' },
  remediation_requested: { service: 'AGENT3', defaultPort: 8083, endpoint: '/webhook/remediation_requested' },
  session_record_written: { service: 'AGENT4', defaultPort: 8084, endpoint: '/task/longterm_analysis' },
  document_uploaded: { service: 'AGENT5', defaultPort: 8085, endpoint: '/webhook/document_uploaded' },
  student_report_ready: { service: 'AGENT6', defaultPort: 8086, endpoint: '/webhook/student_report_ready' },
  cohort_intelligence_ready: { service: 'AGENT7', defaultPort: 8087, endpoint: '/workflow/recommendation_generation' },
  agent_output_produced: { service: 'AGENT8', defaultPort: 8088, endpoint: '/judge/output' },
  schema_validation_failed: { service: 'AGENT8', defaultPort: 8088, endpoint: '/schedule/evaluate' },
};

export function resolveTopicUrl(topicName: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const route = TOPIC_ROUTES[topicName];
  if (!route) return null;
  const base = (env[`${route.service}_URL`] || `http://localhost:${route.defaultPort}`).replace(/\/$/, '');
  return `${base}${route.endpoint}`;
}

export const publishEvent = async (topicName: string, data: any) => {
  const url = resolveTopicUrl(topicName);
  if (!url) {
    console.warn(`[PubSub] No route for topic ${topicName}`);
    return;
  }
  console.log(`[PubSub] Emitting ${topicName} -> ${url}`);

  // Fire-and-forget: the publisher never waits for the consumer.
  setTimeout(() => {
    fetch(url, { method: 'POST', headers: agentKeyHeaders(), body: JSON.stringify(data) })
      .then((res) => {
        if (!res.ok) console.error(`[PubSub] ${topicName} delivery returned ${res.status}`);
      })
      .catch((err) => console.error(`[PubSub] Delivery to ${topicName} failed: ${err.message}`));
  }, 100);
};
