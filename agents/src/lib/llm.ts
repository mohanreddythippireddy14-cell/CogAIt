import Groq from 'groq-sdk';

/**
 * Shared LLM client for every agent.
 *
 * The agents use the Groq SDK only as an OpenAI-compatible HTTP client. Requests go to
 * the Convex HTTP route `/api/gemini-proxy/openai/v1/chat/completions`, which forwards
 * them to Google's OpenAI-compatible Gemini endpoint. The API key is therefore a
 * Gemini key (GOOGLE_API_KEY), not a Groq key.
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export function getModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

/**
 * Derives the Convex site URL (HTTP actions) from the deployment URL.
 * `https://x.convex.cloud` -> `https://x.convex.site`; local backend port 3210 -> 3211.
 */
export function convexSiteUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CONVEX_SITE_URL) return env.CONVEX_SITE_URL.replace(/\/$/, '');
  const convexUrl = env.CONVEX_URL?.replace(/\/$/, '');
  if (!convexUrl) {
    throw new Error('CONVEX_URL is not set. Copy agents/.env.example to agents/.env and fill it in.');
  }
  if (convexUrl.endsWith('.convex.cloud')) return convexUrl.replace(/\.convex\.cloud$/, '.convex.site');
  if (/:3210$/.test(convexUrl)) return convexUrl.replace(/:3210$/, ':3211');
  return convexUrl;
}

export function geminiProxyBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `${convexSiteUrl(env)}/api/gemini-proxy/`;
}

let client: Groq | null = null;

/**
 * Returns the shared client, created on first use so a service can start (and report a
 * clear error per request) even when the key is missing.
 */
export function llm(): Groq {
  if (!client) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY is not set. Copy agents/.env.example to agents/.env and fill it in.');
    }
    client = new Groq({ apiKey, baseURL: geminiProxyBaseUrl() });
  }
  return client;
}

/**
 * Parses a model reply that should be a JSON object, tolerating ```json fences.
 */
export function parseJsonReply<T>(content: string | null | undefined): T {
  const text = (content ?? '').replace(/```json/g, '').replace(/```/g, '').trim();
  if (!text) throw new Error('Model returned an empty reply.');
  return JSON.parse(text) as T;
}
