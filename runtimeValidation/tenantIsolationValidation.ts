import fs from "node:fs";
import path from "node:path";
import { assert } from "./assert.js";

function read(file: string) {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}

function assertNoPublicInternalEndpoints() {
  const source = read("convex/facultyAssignments.ts");
  const forbidden = [
    "export const getJobByIdInternal = query(",
    "export const updateJobStatusInternal = mutation(",
    "export const replaceQuestionsForDraftInternal = mutation(",
    "export const completeJobInternal = mutation(",
    "export const failJobInternal = mutation(",
    "export const updateAssignmentAiStatusInternal = mutation(",
  ];
  for (const pattern of forbidden) {
    assert(!source.includes(pattern), `Forbidden public endpoint found: ${pattern}`);
  }
}

function assertGuardedIdFetches() {
  const source = read("convex/facultyAssignments.ts");
  assert(source.includes("requireSameOrganization(job.organizationId, args.expectedOrganizationId)"), "Job ID fetch must enforce org guard");
}

export async function runTenantIsolationValidation() {
  assertNoPublicInternalEndpoints();
  assertGuardedIdFetches();
}
