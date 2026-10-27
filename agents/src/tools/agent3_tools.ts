// Tools for Agent 3 (Content Agent)

/**
 * No verified content datastore is connected yet (see FUTURE_ACTIONS.md: Vertex AI Search
 * over NTA/coaching material). Until then Agent 3 says so in its prompt and caps confidence.
 */
export const GROUNDING_SOURCE = 'none connected (model knowledge only)';

/** Highest confidence allowed for content that is not grounded in a verified source. */
export const MAX_UNGROUNDED_CONFIDENCE = 0.6;
