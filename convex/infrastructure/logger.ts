import type { Id } from "../_generated/dataModel.js";
import { isFeatureEnabled } from "./featureFlags.js";

type LogLevel = "debug" | "info" | "warn" | "error";

export function logEvent(params: {
  event: string;
  level?: LogLevel;
  organizationId?: Id<"organizations"> | string;
  payload?: Record<string, unknown>;
}) {
  if (!isFeatureEnabled("structuredLogging", params.organizationId)) {
    return;
  }
  const entry = {
    ts: new Date().toISOString(),
    level: params.level ?? "info",
    event: params.event,
    organizationId: params.organizationId ? String(params.organizationId) : undefined,
    payload: params.payload ?? {},
  };

  try {
    queueMicrotask(() => {
      try {
        console.log(JSON.stringify(entry));
      } catch {
        // Keep logging non-blocking and non-fatal.
      }
    });
  } catch {
    // Keep logging non-blocking and non-fatal.
  }
}
