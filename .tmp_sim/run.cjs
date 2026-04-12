const flags = require('./.tmp_sim/infrastructure/featureFlags.js');
const logger = require('./.tmp_sim/infrastructure/logger.js');
const integrity = require('./.tmp_sim/application/integrityMetricsService.js');

const before = flags.getFeatureFlagSnapshot();
if (before.structuredLogging !== false || before.aiUsageMetrics !== false || before.integrityDashboard !== false) {
  throw new Error('Default-safe flags are not off');
}

flags.setOrganizationFeatureFlag('orgA', 'structuredLogging', true);
if (!flags.isFeatureEnabled('structuredLogging', 'orgA')) throw new Error('Org override failed');
if (flags.isFeatureEnabled('structuredLogging', 'orgB')) throw new Error('Org isolation failed');

logger.logEvent({ event: 'runtime.simulation.logger', organizationId: 'orgA', payload: { ok: true } });
const summary = integrity.buildIntegritySummary([
  { tabSwitchCount: 2, copyPasteAttempts: 1, violationWarnings: [{ type: 'tabSwitch' }] },
  { tabSwitchCount: 3, copyPasteAttempts: 0, violationWarnings: [{ type: 'copyPaste' }, { type: 'tabSwitch' }] },
]);
if (summary.totalViolations !== 3 || summary.totalTabSwitches !== 5 || summary.totalCopyPasteAttempts !== 1) {
  throw new Error('Integrity summary simulation failed');
}

console.log('RUNTIME_SIMULATION_OK');
