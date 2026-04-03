# API v1 Routing Migration

## Purpose
- Introduce a feature-flagged API routing path for versioned backend evolution.
- Keep existing API contracts unchanged while enabling controlled migration.

## Activation
- Feature flag: `apiV1Routing`
- Default: disabled
- Scope: organization-level

## Behavior
- When disabled:
  - Existing base API remains active.
  - `apiV1.getStudentAssignmentsV1` rejects requests.
- When enabled:
  - `apiV1.getStudentAssignmentsV1` delegates to the current assignments query.
  - Returned payload structure matches existing contract.

## Rollback
- Disable `apiV1Routing` at organization scope.
- Base API behavior remains unchanged.
