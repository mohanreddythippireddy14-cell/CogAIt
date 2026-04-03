"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIntegritySummary = buildIntegritySummary;
function buildIntegritySummary(locks) {
    const activeSessions = locks.length;
    const totalTabSwitches = locks.reduce((sum, lock) => sum + lock.tabSwitchCount, 0);
    const totalCopyPasteAttempts = locks.reduce((sum, lock) => sum + lock.copyPasteAttempts, 0);
    const totalViolations = locks.reduce((sum, lock) => sum + lock.violationWarnings.length, 0);
    return {
        activeSessions,
        totalTabSwitches,
        totalCopyPasteAttempts,
        totalViolations,
    };
}
