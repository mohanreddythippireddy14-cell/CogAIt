import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "../_generated/api";
import { Id } from "../_generated/dataModel";

type Role = "student" | "lecturer" | "organizationAdmin";

function hasRequiredRole(userRole: Role, requiredRole: Role): boolean {
  if (requiredRole === "lecturer") {
    return userRole === "lecturer" || userRole === "organizationAdmin";
  }
  return userRole === requiredRole;
}

export async function getAuthUserIdOrNull(ctx: any): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

export async function requireAuth(ctx: any): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
  return userId;
}

export async function requireRole(ctx: any, role: Role): Promise<Id<"users">> {
  const userId = await requireAuth(ctx);
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  if (!profile || !hasRequiredRole(profile.role, role)) {
    throw new Error(`Only ${role}s can perform this action`);
  }
  return userId;
}

export async function requireAuthWithProfile(ctx: any): Promise<{
  userId: Id<"users">;
  profile: {
    organizationId: Id<"organizations">;
    role: Role;
  };
}> {
  const userId = await requireAuth(ctx);
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  if (!profile) {
    throw new Error("User profile not found");
  }
  if (!profile.organizationId) {
    throw new Error("User organization not found");
  }
  return {
    userId,
    profile: {
      organizationId: profile.organizationId,
      role: profile.role,
    },
  };
}

export async function requireRoleOrNull(ctx: any, role: Role): Promise<Id<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  if (!profile || !hasRequiredRole(profile.role, role)) {
    return null;
  }
  return userId;
}

export function requireOwnership(resourceOwnerId: Id<"users">, userId: Id<"users">) {
  if (resourceOwnerId !== userId) {
    throw new Error("Access denied");
  }
}

export async function requireRoleFromAction(ctx: any, role: Role): Promise<Id<"users">> {
  const user = await ctx.runQuery(api.users.loggedInUserWithProfile, {});
  if (!user?.userId || !user.profile || !hasRequiredRole(user.profile.role, role)) {
    throw new Error(`Only ${role}s can perform this action`);
  }
  return user.userId;
}

export async function requireAuthFromAction(ctx: any): Promise<Id<"users">> {
  const user = await ctx.runQuery(api.users.loggedInUserWithProfile, {});
  if (!user?.userId) {
    throw new Error("Not authenticated");
  }
  return user.userId;
}
