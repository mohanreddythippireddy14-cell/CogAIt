import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { HELP_LEVELS } from "./constants";
import { requireAuthFromAction, requireAuthWithProfile } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";
import { generateMultimodalWithFallback, generateTextWithFallback } from "./infrastructure/geminiClient";
import {
  getAiFallbackResponse,
  getIntermediateCalculationsUsed,
  isValidHelpLevel,
  RESPONSE_REGENERATION_LIMIT,
  validateAiResponse,
} from "./domain/aiPolicy";
import { enforceHelpRequestPolicy } from "./application/aiService";
import { isFeatureEnabled } from "./infrastructure/featureFlags";
import { logEvent } from "./infrastructure/logger";
import { shouldBlockForRegression } from "./domain/aiRegression";
import {
  blocksToLegacyText,
  normalizeLegacyQuestionToBlocks,
  toAiStructuredLines,
} from "./domain/contentBlocks";

if (!process.env.GOOGLE_API_KEY) {
  throw new Error("Missing GOOGLE_API_KEY environment variable");
}

const aiInteractionValidator = v.object({
  _id: v.id("aiInteractions"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  attemptId: v.id("attempts"),
  helpLevel: v.number(),
  studentInput: v.string(),
  aiResponse: v.string(),
  tokensUsed: v.optional(v.number()),
  responseTimeMs: v.optional(v.number()),
  reflectionProvided: v.optional(v.boolean()),
  reflectionText: v.optional(v.string()),
  assignmentId: v.optional(v.id("assignments")),
  studentId: v.optional(v.id("users")),
});

function buildRegenerationPrompt(
  questionContext: string,
  studentInput: string,
  violations: string[],
  helpLevel: (typeof HELP_LEVELS)[number],
): string {
  return `You are CogAIt, a concise thinking coach.
Help Level: ${helpLevel}
Question:
${questionContext}
Student Input: ${studentInput}

Your previous response violated:
${violations.map((v) => `- ${v}`).join("\n")}

Regenerate one concise response that:
- sparks cognitive thinking,
- gives one focused question or one short hint,
- avoids final answers and full solutions.`;
}

function buildQuestionContext(params: {
  questionText: string;
  givenVariables?: string;
  contentBlocks?: ReturnType<typeof normalizeLegacyQuestionToBlocks>;
}): { structured: string; plainText: string } {
  const blocks = params.contentBlocks ?? normalizeLegacyQuestionToBlocks(params.questionText);
  const structuredLines = toAiStructuredLines(blocks);
  if (params.givenVariables?.trim()) {
    structuredLines.push(`Text: Given Variables: ${params.givenVariables.trim()}`);
  }
  return {
    structured: structuredLines.join("\n"),
    plainText: blocksToLegacyText(blocks),
  };
}

function normalizeBase64(input: string): string {
  const dataUrlIndex = input.indexOf("base64,");
  if (dataUrlIndex >= 0) {
    return input.slice(dataUrlIndex + "base64,".length);
  }
  return input;
}

function getBase64SizeBytes(input: string): number {
  const base64 = normalizeBase64(input).replace(/\s/g, "");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function looksLikeGibberish(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 6) {
    return false;
  }
  const alnum = (trimmed.match(/[a-z0-9]/gi) ?? []).length;
  if (alnum / trimmed.length < 0.4) {
    return true;
  }
  return /^(.)\1{5,}$/i.test(trimmed.replace(/\s/g, ""));
}

function requestsFinalAnswer(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("final answer") ||
    normalized.includes("just answer") ||
    normalized.includes("only answer") ||
    normalized.includes("give answer directly")
  );
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end + 1));
        return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function buildCognitivePrompt(params: {
  activeHelpLevel: (typeof HELP_LEVELS)[number];
  intermediateCalculationsUsed: number;
  conversationTurnCount: number;
}): string {
  const levelDirective =
    params.activeHelpLevel === 1
      ? `
LEVEL 1 — Pure Socratic (Minimal Help):
- Ask one single, open-ended conceptual question only.
- Do not hint at any method, formula, or direction.
- Challenge the student's assumptions with pure curiosity.
- Example style: "What do you already know about this type of problem?"
`.trim()
      : params.activeHelpLevel === 2
        ? `
LEVEL 2 — Guided Socratic (Light Help):
- Acknowledge what the student seems to be thinking.
- Ask two layered questions: one broad, one slightly more focused.
- You may gently expose a gap or contradiction in their reasoning — but through a question, never a statement.
- Do not name any formula or method directly.
- Example style: "What happens if you look at the relationship between X and Y more closely?"
`.trim()
        : params.activeHelpLevel === 3
          ? `
LEVEL 3 — Directed Socratic (Moderate Help):
- You may reference a relevant concept, method, or formula by name — but frame it as a question.
- Ask the student how they might apply it, not how to apply it.
- Prompt them to identify the next step themselves.
- Example style: "Have you considered using [concept]? If so, what would your first step be?"
`.trim()
          : `
LEVEL 4 — Scaffolded Socratic (Maximum Help):
- Walk the student to the edge of the answer — but never cross it.
- Provide one concrete, specific next step or micro-hint.
- Then immediately ask them to take that step and tell you the result.
- The student must still perform all thinking and calculation.
- Example style: "Try substituting the value of X into the equation. What do you get?"
`.trim();

  return [
    "You are CogAIt, a Socratic thinking coach.",
    "Your sole purpose is to ignite independent reasoning and cognitive effort in the student.",
    "",
    "═══ CORE SOCRATIC RULES (apply at ALL levels, without exception) ═══",
    "- NEVER provide the final answer.",
    "- NEVER provide a full or partial worked solution.",
    "- NEVER explain a concept unprompted — turn every explanation into a question.",
    "- NEVER praise or confirm correctness directly (e.g. avoid 'Correct!' or 'Exactly!').",
    "- NEVER ask more than 2 questions per response.",
    "- Every response MUST end with a question.",
    "- Respond only to what the student has said — do not jump ahead.",
    "- If the student is frustrated or stuck, reframe the question from a new angle. Do not rescue them.",
    "- The student must feel, at the end, that THEY figured it out.",
    "",
    "═══ DYNAMIC HELP-LEVEL BEHAVIOR ═══",
    "You dynamically manage the student's scaffolding depth (Levels 1-4).",
    "- If the student is completely stuck, confused, or frustrated: INCREASE your level by 1 (max 4).",
    "- If the student is following along well or answering correctly: KEEP the level or DECREASE it (min 1).",
    "",
    "Current constraints based on current level:",
    levelDirective,
    "",
    "═══ CONTEXT ═══",
    `- current_help_level=${params.activeHelpLevel}`,
    `- intermediate_calculations_used=${params.intermediateCalculationsUsed}`,
    `- conversation_turn_count=${params.conversationTurnCount}`,
    "",
    "Remember: more help does not mean more answers. It means smaller, more guided Socratic steps.",
    "",
    "═══ OUTPUT FORMAT ═══",
    "You MUST respond with ONLY valid JSON in this exact format:",
    `{
  "response": "your Socratic question or hint here",
  "new_level": <integer 1 to 4>
}`
  ].join("\n");
}

export const sendChatMessage = action({
  args: {
    attemptId: v.id("attempts"),
    questionId: v.id("questions"),
    studentInput: v.string(),
    helpLevel: v.optional(v.number()),
  },
  returns: v.object({
    response: v.string(),
    tokensUsed: v.number(),
    responseTime: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthFromAction(ctx);

    const history = await ctx.runQuery(api.ai.getConversationHistory, {
      attemptId: args.attemptId,
    });
    
    const lastInteraction = history.length > 0 ? history[history.length - 1] : null;
    const activeHelpLevel = lastInteraction ? lastInteraction.helpLevel : 1;

    if (!isValidHelpLevel(activeHelpLevel)) {
      throw new Error("Invalid help level");
    }
    const attempt = await ctx.runQuery(api.attempts.getAttempt, { attemptId: args.attemptId });

    const question = await ctx.runQuery(api.questions.getById, {
      questionId: args.questionId,
    });
    if (!question) {
      throw new Error("Question not found");
    }

    const studentAssignments = await ctx.runQuery(api.assignments.getStudentAssignments, {});
    const assignmentPolicy = studentAssignments.find((a: any) => a._id === question.assignmentId);
    if (!assignmentPolicy) {
      throw new Error("Assignment policy not found");
    }
    // AI levels are managed autonomously by the Socratic Agent now, bypassing manual UI rollout restrictions.

    const recentHelp = await ctx.runQuery(api.ai.getRecentHelpRequests, {
      attemptId: args.attemptId,
    });
    const now = Date.now();
    enforceHelpRequestPolicy({ recentHelp, now });

    const intermediateCalculationsUsed = getIntermediateCalculationsUsed(history);
    const conversationTurnCount = history.length + 1;

    // Build conversation context
    const questionContext = buildQuestionContext({
      questionText: question.questionText,
      givenVariables: question.givenVariables,
      contentBlocks: question.contentBlocks,
    });
    let conversationText = `${buildCognitivePrompt({
      activeHelpLevel,
      intermediateCalculationsUsed,
      conversationTurnCount,
    })}\n\nQuestion Context:\n${questionContext.structured}\n`;
    conversationText += `\nStudent reasoning: ${args.studentInput}\n`;

    // Add conversation history
    for (const interaction of history) {
      conversationText += `\nStudent: ${interaction.studentInput}\n`;
      conversationText += `Assistant: ${interaction.aiResponse}\n`;
    }

    const startTime = Date.now();
    const reasoningText = (attempt.studentReasoning ?? "").trim();

    try {
      await enforceOrgAiRateLimit(ctx);
      await enforceCostGovernanceBeforeAi(ctx);
      logEvent({
        event: "ai.send_chat.started",
        organizationId: attempt.organizationId,
        payload: { attemptId: String(args.attemptId), questionId: String(args.questionId) },
      });
      let modelUsed = "unknown";
      const promptVersion = isFeatureEnabled("promptVersioning", attempt.organizationId)
        ? "cogait_v1"
        : "legacy";
      let { text: aiResponse, totalTokenCount: tokensUsed } = await generateTextWithFallback({
        prompt: conversationText,
        candidateModels: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"],
        temperature: activeHelpLevel <= 2 ? 0.7 : 0.8,
        maxOutputTokens: getMaxTokens(activeHelpLevel),
        retryQuotaOnce: true,
        onUsage: ({ model }) => {
          modelUsed = model;
        },
      });

      let responseText = aiResponse;
      let effectiveHelpLevel = activeHelpLevel;
      const parsed = parseJsonObject(aiResponse);
      if (parsed && typeof parsed.response === "string" && typeof parsed.new_level === "number") {
        responseText = parsed.response;
        effectiveHelpLevel = Math.max(1, Math.min(4, Math.round(parsed.new_level as number))) as (typeof HELP_LEVELS)[number];
      } else {
        responseText = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      }

      let validation = validateAiResponse(responseText, effectiveHelpLevel);
      let regenerationAttempts = 0;
      while (!validation.valid && regenerationAttempts < RESPONSE_REGENERATION_LIMIT) {
        regenerationAttempts += 1;
        await ctx.runMutation(api.ai.logAiViolation, {
          attemptId: args.attemptId,
          helpLevel: activeHelpLevel,
          violations: validation.violations,
          severity: validation.severity,
          regenerationAttempt: regenerationAttempts,
        });

        const retryPrompt = buildRegenerationPrompt(
          questionContext.structured,
          args.studentInput,
          validation.violations,
          activeHelpLevel,
        );
        const regenerated = await generateTextWithFallback({
          prompt: retryPrompt,
          candidateModels: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"],
          temperature: 0.5,
          maxOutputTokens: getMaxTokens(activeHelpLevel),
          retryQuotaOnce: true,
          onUsage: ({ model }) => {
            modelUsed = model;
          },
        });
        const retryParsed = parseJsonObject(regenerated.text);
        if (retryParsed && typeof retryParsed.response === "string" && typeof retryParsed.new_level === "number") {
          responseText = retryParsed.response;
          effectiveHelpLevel = Math.max(1, Math.min(4, Math.round(retryParsed.new_level as number))) as (typeof HELP_LEVELS)[number];
        } else {
          responseText = regenerated.text.replace(/```json/g, '').replace(/```/g, '').trim();
        }
        tokensUsed = regenerated.totalTokenCount;
        validation = validateAiResponse(responseText, effectiveHelpLevel);
      }
      if (!validation.valid) {
        await ctx.runMutation(api.ai.logAiViolation, {
          attemptId: args.attemptId,
          helpLevel: effectiveHelpLevel,
          violations: validation.violations,
          severity: validation.severity,
          regenerationAttempt: RESPONSE_REGENERATION_LIMIT + 1,
        });
        responseText = getAiFallbackResponse(effectiveHelpLevel);
      }
      if (shouldBlockForRegression({
        aiRegressionEnforcementEnabled: isFeatureEnabled("aiRegressionEnforcement", attempt.organizationId),
        validationValid: validation.valid,
      })) {
        throw new Error("AI regression enforcement blocked unsafe response");
      }

      const responseTime = Date.now() - startTime;

      await ctx.runMutation(api.ai.storeInteraction, {
        attemptId: args.attemptId,
        helpLevel: effectiveHelpLevel,
        studentInput: args.studentInput,
        aiResponse: responseText,
        tokensUsed,
        responseTimeMs: responseTime,
      });
      if (isFeatureEnabled("aiUsageMetrics", attempt.organizationId)) {
        await ctx.runMutation(api.ai.logAiUsageMetric, {
          assignmentId: question.assignmentId,
          tokensUsed,
          model: modelUsed,
        });
      }
      await ctx.runMutation((api as any).costGovernance.recordAiUsage, {
        tokensUsed,
      });
      if (isFeatureEnabled("promptVersioning", attempt.organizationId)) {
        await ctx.runMutation((api as any).ai.logPromptVersionEvent, {
          assignmentId: question.assignmentId,
          attemptId: args.attemptId,
          promptVersion,
          model: modelUsed,
          studentId: userId,
        });
      }

      await ctx.runMutation(api.attempts.updateHelpStats, {
        attemptId: args.attemptId,
        helpLevel: activeHelpLevel,
        reasoningChars: reasoningText.length,
        reasoningTextSnapshot: attempt.studentReasoning,
      });

      return {
        response: responseText,
        tokensUsed,
        responseTime,
      };
    } catch (error: any) {
      logEvent({
        event: "ai.send_chat.failed",
        level: "error",
        organizationId: attempt.organizationId,
        payload: { attemptId: String(args.attemptId), error: String(error?.message ?? error) },
      });
      throw new Error(`Gemini API error: ${error.message || error}`);
    }
  },
});

export const sendImageFeedback = action({
  args: {
    attemptId: v.id("attempts"),
    questionId: v.id("questions"),
    question_text: v.string(),
    mode: v.string(),
    help_level: v.optional(v.number()),
    image_base64: v.string(),
    system_prompt_version: v.string(),
  },
  returns: v.object({
    response: v.string(),
    tokensUsed: v.number(),
    responseTime: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthFromAction(ctx);
    const activeHelpLevel = args.help_level ?? 1;
    if (!isValidHelpLevel(activeHelpLevel)) {
      throw new Error("Invalid help level");
    }
    const attempt = await ctx.runQuery(api.attempts.getAttempt, { attemptId: args.attemptId });
    const question = await ctx.runQuery(api.questions.getById, {
      questionId: args.questionId,
    });
    if (!question) {
      throw new Error("Question not found");
    }
    const studentAssignments = await ctx.runQuery(api.assignments.getStudentAssignments, {});
    const assignmentPolicy = studentAssignments.find((a: any) => a._id === question.assignmentId);
    if (!assignmentPolicy) {
      throw new Error("Assignment policy not found");
    }

    const imageSizeBytes = getBase64SizeBytes(args.image_base64);
    if (imageSizeBytes > 5 * 1024 * 1024) {
      throw new Error("Image too large. Maximum allowed size is 5MB.");
    }

    const history = await ctx.runQuery(api.ai.getConversationHistory, {
      attemptId: args.attemptId,
    });

    const intermediateCalculationsUsed = getIntermediateCalculationsUsed(history);
    const conversationTurnCount = history.length + 1;
    const reasoningText = (attempt.studentReasoning ?? "").trim();

    const systemPrompt = buildCognitivePrompt({
      activeHelpLevel,
      intermediateCalculationsUsed,
      conversationTurnCount,
    });
    const questionContext = buildQuestionContext({
      questionText: question.questionText,
      givenVariables: question.givenVariables,
      contentBlocks: question.contentBlocks,
    });

    const startTime = Date.now();
    try {
      await enforceOrgAiRateLimit(ctx);
      await enforceCostGovernanceBeforeAi(ctx);
      logEvent({
        event: "ai.send_image_feedback.started",
        organizationId: attempt.organizationId,
        payload: { attemptId: String(args.attemptId), questionId: String(args.questionId) },
      });
      let modelUsed = "unknown";
      const promptVersion = isFeatureEnabled("promptVersioning", attempt.organizationId)
        ? "cogait_v1"
        : "legacy";
      const result = await generateMultimodalWithFallback({
        promptParts: [
          { text: systemPrompt },
          { text: `Here is the question context:\n${questionContext.structured}` },
          { text: "Analyze the student's work in the image. Follow constraints strictly." },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: normalizeBase64(args.image_base64),
            },
          },
          {
            text:
              `mode=${args.mode}; help_level=${activeHelpLevel}; system_prompt_version=${args.system_prompt_version}`,
          },
        ],
        candidateModels: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
        temperature: activeHelpLevel <= 2 ? 0.7 : 0.8,
        maxOutputTokens: getMaxTokens(activeHelpLevel),
        retryQuotaOnce: true,
        onUsage: ({ model }) => {
          modelUsed = model;
        },
      });

      let aiResponse = result.text;
      const validation = validateAiResponse(aiResponse, activeHelpLevel);
      if (!validation.valid) {
        await ctx.runMutation(api.ai.logAiViolation, {
          attemptId: args.attemptId,
          helpLevel: activeHelpLevel,
          violations: validation.violations,
          severity: validation.severity,
          regenerationAttempt: 1,
        });
        aiResponse = getAiFallbackResponse(activeHelpLevel);
      }
      if (shouldBlockForRegression({
        aiRegressionEnforcementEnabled: isFeatureEnabled("aiRegressionEnforcement", attempt.organizationId),
        validationValid: validation.valid,
      })) {
        throw new Error("AI regression enforcement blocked unsafe response");
      }

      const tokensUsed = result.totalTokenCount;
      const responseTime = Date.now() - startTime;
      console.log("sendImageFeedback Gemini response", {
        attemptId: args.attemptId,
        questionId: args.questionId,
        responseLength: aiResponse.length,
        tokensUsed,
      });

      await ctx.runMutation(api.ai.storeInteraction, {
        attemptId: args.attemptId,
        helpLevel: activeHelpLevel,
        studentInput: `[IMAGE_UPLOAD] mode=${args.mode} prompt=${args.system_prompt_version}`,
        aiResponse,
        tokensUsed,
        responseTimeMs: responseTime,
      });
      if (isFeatureEnabled("aiUsageMetrics", attempt.organizationId)) {
        await ctx.runMutation(api.ai.logAiUsageMetric, {
          assignmentId: attempt.assignmentId,
          tokensUsed,
          model: modelUsed,
        });
      }
      await ctx.runMutation((api as any).costGovernance.recordAiUsage, {
        tokensUsed,
      });
      if (isFeatureEnabled("promptVersioning", attempt.organizationId)) {
        await ctx.runMutation((api as any).ai.logPromptVersionEvent, {
          assignmentId: attempt.assignmentId,
          attemptId: args.attemptId,
          promptVersion,
          model: modelUsed,
          studentId: userId,
        });
      }

      await ctx.runMutation(api.attempts.updateHelpStats, {
        attemptId: args.attemptId,
        helpLevel: activeHelpLevel,
        reasoningChars: reasoningText.length,
        reasoningTextSnapshot: attempt.studentReasoning,
      });

      return {
        response: aiResponse,
        tokensUsed,
        responseTime,
      };
    } catch (error: any) {
      logEvent({
        event: "ai.send_image_feedback.failed",
        level: "error",
        organizationId: attempt.organizationId,
        payload: { attemptId: String(args.attemptId), error: String(error?.message ?? error) },
      });
      throw new Error(`Gemini image API error: ${error.message || error}`);
    }
  },
});

export const storeInteraction = mutation({
  args: {
    attemptId: v.id("attempts"),
    helpLevel: v.number(),
    studentInput: v.string(),
    aiResponse: v.string(),
    tokensUsed: v.optional(v.number()),
    responseTimeMs: v.optional(v.number()),
    reflectionProvided: v.optional(v.boolean()),
    reflectionText: v.optional(v.string()),
  },
  returns: v.id("aiInteractions"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (!isValidHelpLevel(args.helpLevel)) {
      throw new Error("Invalid help level");
    }
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Attempt not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);

    const interactionId = await ctx.db.insert("aiInteractions", {
      organizationId: profile.organizationId,
      attemptId: args.attemptId,
      helpLevel: args.helpLevel,
      studentInput: args.studentInput,
      aiResponse: args.aiResponse,
      tokensUsed: args.tokensUsed,
      responseTimeMs: args.responseTimeMs,
      reflectionProvided: args.reflectionProvided ?? false,
      reflectionText: args.reflectionText,
      assignmentId: attempt.assignmentId,
      studentId: userId,
    });
    await ctx.runMutation((internal as any).dashboardRollups.recomputeAssignmentRollups, {
      assignmentId: attempt.assignmentId,
    });
    return interactionId;
  },
});

export const getConversationHistory = query({
  args: {
    attemptId: v.id("attempts"),
  },
  returns: v.array(aiInteractionValidator),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Attempt not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);
    return await ctx.db
      .query("aiInteractions")
      .withIndex("by_attempt", (q) => q.eq("attemptId", args.attemptId))
      .order("asc")
      .collect();
  },
});

export const getRecentHelpRequests = query({
  args: {
    attemptId: v.id("attempts"),
  },
  returns: v.array(aiInteractionValidator),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Attempt not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);
    return await ctx.db
      .query("aiInteractions")
      .withIndex("by_attempt", (q) => q.eq("attemptId", args.attemptId))
      .order("desc")
      .take(10);
  },
});

export const submitReflection = mutation({
  args: {
    interactionId: v.id("aiInteractions"),
    reflectionText: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (args.reflectionText.trim().length < 50) {
      throw new Error("Reflection must be at least 50 characters.");
    }
    const interaction = await ctx.db.get(args.interactionId);
    if (!interaction) {
      throw new Error("Interaction not found");
    }
    const attempt = await ctx.db.get(interaction.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Interaction not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);
    await ctx.db.patch(args.interactionId, {
      reflectionProvided: true,
      reflectionText: args.reflectionText.trim(),
    });
    return { success: true };
  },
});

export const logAiViolation = mutation({
  args: {
    attemptId: v.id("attempts"),
    helpLevel: v.number(),
    violations: v.array(v.string()),
    severity: v.union(v.literal("low"), v.literal("high")),
    regenerationAttempt: v.number(),
  },
  returns: v.id("aiViolations"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Attempt not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);
    return await ctx.db.insert("aiViolations", {
      attemptId: args.attemptId,
      helpLevel: args.helpLevel,
      violations: args.violations,
      severity: args.severity,
      regenerationAttempt: args.regenerationAttempt,
      timestamp: Date.now(),
    });
  },
});

export const logAiUsageMetric = mutation({
  args: {
    assignmentId: v.id("assignments"),
    tokensUsed: v.number(),
    model: v.string(),
  },
  returns: v.id("aiUsageMetrics"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (!isFeatureEnabled("aiUsageMetrics", profile.organizationId)) {
      throw new Error("AI usage metrics feature is disabled");
    }
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);
    return await ctx.db.insert("aiUsageMetrics", {
      organizationId: profile.organizationId,
      studentId: userId,
      assignmentId: args.assignmentId,
      tokensUsed: args.tokensUsed,
      model: args.model,
      createdAt: Date.now(),
    });
  },
});

export const logPromptVersionEvent = mutation({
  args: {
    assignmentId: v.id("assignments"),
    attemptId: v.id("attempts"),
    promptVersion: v.string(),
    model: v.string(),
    studentId: v.id("users"),
  },
  returns: v.id("promptVersionEvents"),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (userId !== args.studentId) {
      throw new Error("Unauthorized prompt version event");
    }
    if (!isFeatureEnabled("promptVersioning", profile.organizationId)) {
      throw new Error("Prompt versioning feature is disabled");
    }
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.studentId !== userId) {
      throw new Error("Attempt not found or access denied");
    }
    requireSameOrganization(attempt.organizationId, profile.organizationId);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);
    return await ctx.db.insert("promptVersionEvents", {
      organizationId: profile.organizationId,
      studentId: userId,
      assignmentId: args.assignmentId,
      attemptId: args.attemptId,
      promptVersion: args.promptVersion,
      model: args.model,
      createdAt: Date.now(),
    });
  },
});

function getMaxTokens(helpLevel: (typeof HELP_LEVELS)[number]): number {
  if (helpLevel === 1) {
    return 3000;
  }
  if (helpLevel === 2 || helpLevel === 3) {
    return 4000;
  }
  return 5000;
}

async function enforceOrgAiRateLimit(ctx: any) {
  const result = await ctx.runMutation((api as any).rateLimits.consumeOrgRateLimit, {
    key: "ai_requests_daily",
    limit: 5000,
    windowMs: 24 * 60 * 60 * 1000,
  });
  if (!result.allowed) {
    throw new Error(
      `Organization AI rate limit reached. Retry after ${new Date(result.retryAt ?? Date.now()).toISOString()}`,
    );
  }
}

async function enforceCostGovernanceBeforeAi(ctx: any) {
  const result = await ctx.runMutation((api as any).costGovernance.evaluateBeforeAi, {
    requestedTokens: 0,
  });
  if (!result.allowed) {
    throw new Error("AI request blocked by cost governance hard stop");
  }
}