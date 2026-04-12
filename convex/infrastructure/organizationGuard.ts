import { Id } from "../_generated/dataModel";
import { requireAuth } from "./authGuards";

export async function requireOrganization(
  ctx: any,
): Promise<{ userId: Id<"users">; organizationId: Id<"organizations"> }> {
  const userId = await requireAuth(ctx);
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  if (!profile?.organizationId) {
    throw new Error("User is not associated with an organization");
  }
  return { userId, organizationId: profile.organizationId };
}

export function requireSameOrganization(
  resourceOrgId: Id<"organizations"> | undefined,
  userOrgId: Id<"organizations">,
) {
  if (!resourceOrgId || resourceOrgId !== userOrgId) {
    throw new Error("Unauthorized: cross-organization access denied");
  }
}
