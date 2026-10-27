import {
  getCooldownRemainingMs,
  getRecentHelpCount,
  isRateLimitedByWindow,
  TEXT_RATE_LIMIT,
} from "../domain/aiPolicy";

/**
 * Per-student help limit: at most TEXT_RATE_LIMIT.maxRequestsPerWindow requests in any
 * 5-minute window, and a TEXT_RATE_LIMIT.cooldownMs pause between two requests.
 * `recentHelp` must hold the student's most recent interactions (any question).
 * Throws a student-readable error when the request must wait.
 */
export function enforceHelpRequestPolicy(params: {
  recentHelp: Array<{ _creationTime: number }>;
  now: number;
}) {
  const { recentHelp, now } = params;
  const inWindow = recentHelp
    .map((entry) => entry._creationTime)
    .filter((createdAt) => createdAt >= now - TEXT_RATE_LIMIT.windowMs);

  if (isRateLimitedByWindow(getRecentHelpCount(recentHelp, now))) {
    const retryInSeconds = Math.ceil((Math.min(...inWindow) + TEXT_RATE_LIMIT.windowMs - now) / 1000);
    throw new Error(
      `Help limit reached (${TEXT_RATE_LIMIT.maxRequestsPerWindow} requests per 5 minutes). ` +
        `Keep working on it and try again in ${retryInSeconds}s.`,
    );
  }

  const latest = recentHelp.length > 0 ? Math.max(...recentHelp.map((entry) => entry._creationTime)) : null;
  const cooldownMs = getCooldownRemainingMs(latest, now);
  if (cooldownMs > 0) {
    throw new Error(`Take ${Math.ceil(cooldownMs / 1000)}s more to think before asking again.`);
  }
}
