import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserIdOrNull, requireAuth } from "./lib/authGuards";

function extractEmail(userDoc: unknown): string | undefined {
  if (!userDoc || typeof userDoc !== "object") {
    return undefined;
  }
  const candidate = userDoc as {
    email?: unknown;
    emailVerification?: { email?: unknown };
    emailAddresses?: Array<{ email?: unknown }>;
  };
  if (typeof candidate.email === "string") {
    return candidate.email;
  }
  if (typeof candidate.emailVerification?.email === "string") {
    return candidate.emailVerification.email;
  }
  const primary = candidate.emailAddresses?.find((entry) => typeof entry.email === "string");
  if (typeof primary?.email === "string") {
    return primary.email;
  }
  return undefined;
}
export const createUserProfile = mutation({
  args: {
    fullName: v.string(),
    role: v.union(
      v.literal("student"),
      v.literal("lecturer"),
    ),
    institution: v.optional(v.string()),
  },
  returns: v.id("userProfiles"),
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    // Check if profile already exists
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      throw new Error("Profile already exists");
    }

    const defaultOrganizationName = "Default Organization";
    let organization = await ctx.db
      .query("organizations")
      .withIndex("by_name", (q) => q.eq("name", defaultOrganizationName))
      .first();

    let assignedRole: "student" | "lecturer" | "organizationAdmin" = args.role;
    if (!organization) {
      const organizationId = await ctx.db.insert("organizations", {
        name: defaultOrganizationName,
        createdAt: Date.now(),
        createdBy: userId,
        planTier: "free",
        isActive: true,
      });
      organization = await ctx.db.get(organizationId);
      assignedRole = "organizationAdmin";
    } else if (args.role !== "student" && args.role !== "lecturer") {
      throw new Error("Invalid role");
    }
    if (!organization) {
      throw new Error("Failed to resolve organization");
    }

    return await ctx.db.insert("userProfiles", {
      userId,
      organizationId: organization._id,
      fullName: args.fullName,
      role: assignedRole,
      institution: args.institution,
    });
  },
});

export const getCurrentUser = query({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id("users"),
      email: v.optional(v.string()),
      profile: v.union(
        v.object({
          _id: v.id("userProfiles"),
          _creationTime: v.number(),
          userId: v.id("users"),
          organizationId: v.id("organizations"),
          fullName: v.string(),
          role: v.union(
            v.literal("student"),
            v.literal("lecturer"),
            v.literal("organizationAdmin"),
          ),
          institution: v.optional(v.string()),
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserIdOrNull(ctx);
    if (!userId) {
      return null;
    }
    const userDoc = await ctx.db.get(userId);

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return {
      userId,
      email: extractEmail(userDoc),
      profile,
    };
  },
});

export const loggedInUserWithProfile = query({
  args: {},
  returns: v.union(
    v.object({
      userId: v.id("users"),
      email: v.optional(v.string()),
      profile: v.union(
        v.object({
          _id: v.id("userProfiles"),
          _creationTime: v.number(),
          userId: v.id("users"),
          organizationId: v.id("organizations"),
          fullName: v.string(),
          role: v.union(
            v.literal("student"),
            v.literal("lecturer"),
            v.literal("organizationAdmin"),
          ),
          institution: v.optional(v.string()),
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserIdOrNull(ctx);
    if (!userId) {
      return null;
    }
    const userDoc = await ctx.db.get(userId);

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return {
      userId,
      email: extractEmail(userDoc),
      profile,
    };
  },
});
