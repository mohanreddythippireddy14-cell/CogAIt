export function evaluateCostGovernanceDecision(params: {
  currentTokensUsed: number;
  requestedTokens: number;
  dailyCap: number;
  softWarningThreshold: number;
  adminOverrideUntil?: number;
  hardStopTriggered: boolean;
  now: number;
}) {
  const cap = Math.max(1, params.dailyCap);
  const softThreshold = Math.min(1, Math.max(0, params.softWarningThreshold));
  const overrideActive = Boolean(params.adminOverrideUntil && params.adminOverrideUntil > params.now);
  const projected = params.currentTokensUsed + Math.max(0, params.requestedTokens);
  const hardStop = (params.hardStopTriggered || projected >= cap) && !overrideActive;
  const softWarning = projected >= Math.floor(cap * softThreshold);
  const anomaly = projected >= Math.floor(cap * 1.5);
  const remaining = Math.max(0, cap - projected);
  return {
    hardStop,
    softWarning,
    anomaly,
    remaining,
    overrideActive,
  };
}

export function shouldBlockAiRequest(params: {
  costGovernanceEnabled: boolean;
  hardStop: boolean;
}) {
  if (!params.costGovernanceEnabled) {
    return false;
  }
  return params.hardStop;
}
