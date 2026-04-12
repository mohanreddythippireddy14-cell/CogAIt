"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEvent = logEvent;
const featureFlags_1 = require("./featureFlags");
function logEvent(params) {
    if (!(0, featureFlags_1.isFeatureEnabled)("structuredLogging", params.organizationId)) {
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
            }
            catch {
                // Keep logging non-blocking and non-fatal.
            }
        });
    }
    catch {
        // Keep logging non-blocking and non-fatal.
    }
}
