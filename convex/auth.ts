import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserIdOrNull } from "./lib/authGuards";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});

export const loggedInUser = query({
  args: {},
  returns: v.union(v.object({ userId: v.id("users") }), v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserIdOrNull(ctx);
    if (!userId) {
      return null;
    }
    return { userId };
  },
});
