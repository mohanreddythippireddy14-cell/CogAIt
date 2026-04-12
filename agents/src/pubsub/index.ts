const TOPIC_PORT_MAPPING: Record<string, number> = {
  'session_ended': 8082,          // Agent 2 (Analyst)
  'weak_topics_identified': 8089, // Negotiation Node
  'remediation_requested': 8083,  // Agent 3 (Content)
  'session_record_written': 8084, // Agent 4 (Long-Term Analyst)
  'student_report_ready': 8086,   // Agent 6 (Cohort Analyst)
  'cohort_intelligence_ready': 8087,// Agent 7 (Recommendation)
  'document_uploaded': 8085,      // Agent 5 (Ingestion)
  'schema_validation_failed': 8088 // Agent 8 (Judge)
};

const ENDPOINT_MAP: Record<string, string> = {
  'session_ended': '/webhook/session_ended',
  'weak_topics_identified': '/webhook/weak_topics_identified', // routed to negotiation node
  'remediation_requested': '/webhook/remediation_requested', // routed to agent 3
  'session_record_written': '/task/longterm_analysis',
  'student_report_ready': '/workflow/cohort_analysis',
  'cohort_intelligence_ready': '/workflow/recommendation_generation',
  'document_uploaded': '/webhook/document_uploaded',
  'schema_validation_failed': '/schedule/evaluate'
};

export const publishEvent = async (topicName: string, data: any) => {
  console.log(`[PubSub Mock] Emitting event to ${topicName}`);
  
  const port = TOPIC_PORT_MAPPING[topicName];
  const endpoint = ENDPOINT_MAP[topicName];

  if (!port || !endpoint) {
    console.warn(`[PubSub Mock] No port mapped for topic ${topicName}`);
    return;
  }

  // Simulate fire-and-forget decoupled messaging
  setTimeout(() => {
    fetch(`http://localhost:${port}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).catch(err => {
      console.error(`[PubSub Mock] Delivery to ${topicName} failed: ${err.message}`);
    });
  }, 100); // 100ms async delay
};
