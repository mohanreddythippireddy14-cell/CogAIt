import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const backfillHistoricalRollups = internalAction({
  args: {
    organizationId: v.optional(v.id("organizations")),
  },
  returns: v.object({
    processedAssignments: v.number(),
  }),
  handler: async (ctx, args) => {
    const organizations = args.organizationId
      ? [args.organizationId]
      : await ctx.runQuery((internal as any)["dashboard/jobs"]._getOrganizations, {});

    let processedAssignments = 0;
    const now = Date.now();
    const historicalStart = 0;

    for (const organizationId of organizations) {
      const assignments = await ctx.runQuery((internal as any)["dashboard/jobs"]._getOrganizationAssignments, {
        organizationId,
      });
      for (const assignmentId of assignments) {
        await ctx.runMutation((internal as any).dashboardRollups.recomputeAssignmentRollups, {
          assignmentId,
          sourceWindowStart: historicalStart,
          sourceWindowEnd: now,
        });
        processedAssignments += 1;
      }
    }

    return { processedAssignments };
  },
});

