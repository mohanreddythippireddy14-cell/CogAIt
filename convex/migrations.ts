import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { normalizeLegacyQuestionToBlocks, validateContentBlocks } from "./domain/contentBlocks";

export const backfillDefaultOrganization = internalMutation({
  args: {
    defaultName: v.optional(v.string()),
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    patchedUsers: v.number(),
    patchedAssignments: v.number(),
    patchedJobs: v.number(),
    patchedAttempts: v.number(),
    patchedAlerts: v.number(),
    patchedAiInteractions: v.number(),
    patchedSessionLocks: v.number(),
  }),
  handler: async (ctx, args) => {
    const authedUserId = await getAuthUserId(ctx);
    const fallbackUser = authedUserId ? null : await ctx.db.query("users").first();
    const userId = authedUserId ?? fallbackUser?._id;
    if (!userId) {
      throw new Error("No user exists to attribute default organization creation");
    }
    const now = Date.now();
    const name = (args.defaultName ?? "Default Organization").trim();

    let org = await ctx.db
      .query("organizations")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (!org) {
      const organizationId = await ctx.db.insert("organizations", {
        name,
        createdAt: now,
        createdBy: userId,
        planTier: "starter",
        isActive: true,
      });
      org = await ctx.db.get(organizationId);
    }
    if (!org) {
      throw new Error("Failed to create default organization");
    }

    let patchedUsers = 0;
    let patchedAssignments = 0;
    let patchedJobs = 0;
    let patchedAttempts = 0;
    let patchedAlerts = 0;
    let patchedAiInteractions = 0;
    let patchedSessionLocks = 0;

    const profiles = await ctx.db.query("userProfiles").collect();
    for (const profile of profiles) {
      if (!(profile as any).organizationId) {
        await ctx.db.patch(profile._id, { organizationId: org._id });
        patchedUsers += 1;
      }
    }

    const assignments = await ctx.db.query("assignments").collect();
    for (const assignment of assignments) {
      if (!(assignment as any).organizationId) {
        await ctx.db.patch(assignment._id, { organizationId: org._id });
        patchedAssignments += 1;
      }
    }

    const jobs = await ctx.db.query("facultyAssignmentJobs").collect();
    for (const job of jobs) {
      if (!(job as any).organizationId) {
        await ctx.db.patch(job._id, { organizationId: org._id });
        patchedJobs += 1;
      }
    }

    const attempts = await ctx.db.query("attempts").collect();
    for (const attempt of attempts) {
      if (!(attempt as any).organizationId) {
        const assignment = await ctx.db.get(attempt.assignmentId);
        await ctx.db.patch(attempt._id, { organizationId: assignment?.organizationId ?? org._id });
        patchedAttempts += 1;
      }
    }

    const alerts = await ctx.db.query("dependencyAlerts").collect();
    for (const alert of alerts) {
      if (!(alert as any).organizationId) {
        const assignment = await ctx.db.get(alert.assignmentId);
        await ctx.db.patch(alert._id, { organizationId: assignment?.organizationId ?? org._id });
        patchedAlerts += 1;
      }
    }

    const aiInteractions = await ctx.db.query("aiInteractions").collect();
    for (const interaction of aiInteractions) {
      if (!(interaction as any).organizationId) {
        const attempt = await ctx.db.get(interaction.attemptId);
        await ctx.db.patch(interaction._id, {
          organizationId: attempt?.organizationId ?? org._id,
          assignmentId: attempt?.assignmentId,
          studentId: attempt?.studentId,
        });
        patchedAiInteractions += 1;
      }
    }

    const sessionLocks = await ctx.db.query("sessionLocks").collect();
    for (const lock of sessionLocks) {
      if (!(lock as any).organizationId) {
        const assignment = await ctx.db.get(lock.assignmentId);
        await ctx.db.patch(lock._id, { organizationId: assignment?.organizationId ?? org._id });
        patchedSessionLocks += 1;
      }
    }

    return {
      organizationId: org._id,
      patchedUsers,
      patchedAssignments,
      patchedJobs,
      patchedAttempts,
      patchedAlerts,
      patchedAiInteractions,
      patchedSessionLocks,
    };
  },
});

export const backfillAssessmentDefaults = internalMutation({
  args: {},
  returns: v.object({
    patchedAssignments: v.number(),
    patchedAttempts: v.number(),
    patchedQuestions: v.number(),
  }),
  handler: async (ctx) => {
    let patchedAssignments = 0;
    let patchedAttempts = 0;
    let patchedQuestions = 0;

    const assignments = await ctx.db.query("assignments").collect();
    for (const assignment of assignments) {
      if ((assignment as any).minReasoningChars === undefined) {
        await ctx.db.patch(assignment._id, { minReasoningChars: 30 });
        patchedAssignments += 1;
      }
    }

    const attempts = await ctx.db.query("attempts").collect();
    for (const attempt of attempts) {
      const patch: {
        questionStatus?: "unattempted" | "answered" | "skipped" | "review";
        markedForReview?: boolean;
      } = {};
      if ((attempt as any).questionStatus === undefined) {
        patch.questionStatus = (attempt.studentAnswer ?? "").trim().length > 0 ? "answered" : "unattempted";
      }
      if ((attempt as any).markedForReview === undefined) {
        patch.markedForReview = false;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(attempt._id, patch);
        patchedAttempts += 1;
      }
    }

    const questions = await ctx.db.query("questions").collect();
    for (const question of questions) {
      if ((question as any).subtopic === undefined) {
        await ctx.db.patch(question._id, { subtopic: undefined });
        patchedQuestions += 1;
      }
    }

    return { patchedAssignments, patchedAttempts, patchedQuestions };
  },
});

function sanitizeMathDelimiters(text: string): string {
  return text
    .replace(/\(\s*\$\s*/g, "$")
    .replace(/\s*\$\s*\)/g, "$")
    .replace(/\[\s*\$\$\s*/g, "$$")
    .replace(/\s*\$\$\s*\]/g, "$$");
}

export const sanitizeQuestionMath = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    patched: v.number(),
  }),
  handler: async (ctx) => {
    const questions = await ctx.db.query("questions").collect();
    let patched = 0;
    for (const question of questions) {
      const next = sanitizeMathDelimiters(question.questionText ?? "");
      if (next !== (question.questionText ?? "")) {
        await ctx.db.patch(question._id, { questionText: next });
        patched += 1;
      }
    }
    return { scanned: questions.length, patched };
  },
});

export const backfillQuestionContentBlocks = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    patched: v.number(),
  }),
  handler: async (ctx) => {
    const questions = await ctx.db.query("questions").collect();
    let patched = 0;
    for (const question of questions) {
      if (question.contentBlocks && question.contentBlocks.length > 0) {
        continue;
      }
      const blocks = normalizeLegacyQuestionToBlocks(question.questionText ?? "");
      const validation = validateContentBlocks(blocks);
      if (!validation.valid) {
        continue;
      }
      await ctx.db.patch(question._id, {
        contentBlocks: blocks,
      });
      patched += 1;
    }
    return { scanned: questions.length, patched };
  },
});
