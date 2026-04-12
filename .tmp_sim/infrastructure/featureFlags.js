"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFeatureEnabled = isFeatureEnabled;
exports.setGlobalFeatureFlag = setGlobalFeatureFlag;
exports.clearGlobalFeatureFlag = clearGlobalFeatureFlag;
exports.setOrganizationFeatureFlag = setOrganizationFeatureFlag;
exports.clearOrganizationFeatureFlag = clearOrganizationFeatureFlag;
exports.getFeatureFlagSnapshot = getFeatureFlagSnapshot;
const defaultFlags = {
    structuredLogging: false,
    aiUsageMetrics: false,
    integrityDashboard: false,
    optimizedQueries: false,
    cachingLayer: false,
    aiQueueAbstraction: false,
    auditTrail: false,
    orgRateLimit: false,
    serverSideIntegrity: false,
    strictJsonValidation: false,
    promptVersioning: false,
    aiRegressionEnforcement: false,
    apiV1Routing: false,
    adminDashboard: false,
    multiInstitutionAnalytics: false,
    costGovernance: false,
};
const globalOverrides = {};
const organizationOverrides = new Map();
function toOrgKey(orgId) {
    if (!orgId) {
        return null;
    }
    return String(orgId);
}
function isFeatureEnabled(flag, orgId) {
    const orgKey = toOrgKey(orgId);
    if (orgKey) {
        const orgMap = organizationOverrides.get(orgKey);
        if (orgMap && Object.prototype.hasOwnProperty.call(orgMap, flag)) {
            return Boolean(orgMap[flag]);
        }
    }
    if (Object.prototype.hasOwnProperty.call(globalOverrides, flag)) {
        return Boolean(globalOverrides[flag]);
    }
    return defaultFlags[flag];
}
function setGlobalFeatureFlag(flag, enabled) {
    globalOverrides[flag] = enabled;
}
function clearGlobalFeatureFlag(flag) {
    delete globalOverrides[flag];
}
function setOrganizationFeatureFlag(orgId, flag, enabled) {
    const key = String(orgId);
    const current = organizationOverrides.get(key) ?? {};
    current[flag] = enabled;
    organizationOverrides.set(key, current);
}
function clearOrganizationFeatureFlag(orgId, flag) {
    const key = String(orgId);
    const current = organizationOverrides.get(key);
    if (!current) {
        return;
    }
    delete current[flag];
    if (Object.keys(current).length === 0) {
        organizationOverrides.delete(key);
    }
    else {
        organizationOverrides.set(key, current);
    }
}
function getFeatureFlagSnapshot(orgId) {
    const result = { ...defaultFlags };
    for (const key of Object.keys(globalOverrides)) {
        result[key] = Boolean(globalOverrides[key]);
    }
    const orgKey = toOrgKey(orgId);
    if (orgKey) {
        const current = organizationOverrides.get(orgKey) ?? {};
        for (const key of Object.keys(current)) {
            result[key] = Boolean(current[key]);
        }
    }
    return result;
}
