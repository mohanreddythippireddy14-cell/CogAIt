import fs from "node:fs";
import path from "node:path";
import { assert } from "./assert.js";

function read(file: string) {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}

export async function runAuthValidation() {
  const usersSource = read("convex/users.ts");
  const createUserProfileBlock = usersSource.split("export const createUserProfile = mutation({")[1]?.split("export const getCurrentUser = query({")[0] ?? "";
  assert(!createUserProfileBlock.includes('v.literal("organizationAdmin")'), "createUserProfile must not accept organizationAdmin directly");
  assert(usersSource.includes('role: v.union('), "user profile role validation must exist");

  const guardsSource = read("convex/lib/authGuards.ts");
  assert(guardsSource.includes("hasRequiredRole"), "central role resolver must exist");
  assert(guardsSource.includes("organizationAdmin"), "organizationAdmin role handling must be explicit");

  const exportSource = read("convex/export.ts");
  assert(!exportSource.includes("ctx.auth.getUserIdentity("), "export handlers must not bypass guard layer");
  assert(exportSource.includes("requireAuthFromAction"), "export handlers must use guard-layer auth");
}
