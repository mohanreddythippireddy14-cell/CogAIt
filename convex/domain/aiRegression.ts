export function shouldBlockForRegression(params: {
  aiRegressionEnforcementEnabled: boolean;
  validationValid: boolean;
}): boolean {
  if (!params.aiRegressionEnforcementEnabled) {
    return false;
  }
  return !params.validationValid;
}
