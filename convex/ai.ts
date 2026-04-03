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

async function analyzeReasoningRelevance(params: {
  questionText: string;
  givenVariables?: string;
  contentBlocks?: ReturnType<typeof normalizeLegacyQuestionToBlocks>;
  reasoningText: string;
}): Promise<{
  relevanceScore: number;
  valid: boolean;
  feedback: string;
}> {
  const prompt = [
    "You are an academic reasoning validator.",
    "Task: evaluate whether a student's reasoning is relevant to the question.",
    "Return JSON only with keys: relevanceScore, valid, feedback.",
    "Rules:",
    "- relevanceScore: integer 0-100.",
    "- valid: true only if relevanceScore >= 50.",
    "- feedback: max 2 short sentences, explain mismatch clearly and suggest what to include.",
    "- Do not provide final answer to the question.",
    "",
    "Question Context:",
    buildQuestionContext({
      questionText: params.questionText,
      givenVariables: params.givenVariables,
      contentBlocks: params.contentBlocks,
    }).structured,
    `Student Reasoning: ${params.reasoningText}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await generateTextWithFallback({
    prompt,
    candidateModels: ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"],
    temperature: 0.2,
    maxOutputTokens: 220,
    retryQuotaOnce: true,
  });
  const parsed = parseJsonObject(result.text);
  const rawScore =
    typeof parsed?.relevanceScore === "number"
      ? parsed.relevanceScore
      : Number(parsed?.relevanceScore ?? Number.NaN);
  const boundedScore = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
  const fallbackFeedback = "Your reasoning is not sufficiently related to this question. Mention the exact concept and steps you plan to use.";
  const feedback =
    typeof parsed?.feedback === "string" && parsed.feedback.trim().length > 0
      ? parsed.feedback.trim()
      : fallbackFeedback;
  const valid = boundedScore >= 50;

  return {
    relevanceScore: boundedScore,
    valid,
    feedback,
  };
}

function buildCognitivePrompt(params: {
  activeHelpLevel: (typeof HELP_LEVELS)[number];
  intermediateCalculationsUsed: number;
  conversationTurnCount: number;
}): string {
  const levelDirective =
    params.activeHelpLevel === 1
      ? "Ask one conceptual question only."
      : params.activeHelpLevel === 2
        ? "Give one brief conceptual hint, then one guiding question."
        : params.activeHelpLevel === 3
          ? "Suggest one method or formula direction, then ask for the next step."
          : "Give one concrete next step and ask the student to finish the calculation.";

  return [
    "You are CogAIt, a thinking coach.",
    "Goal: ignite cognitive thinking and independent reasoning.",
    "",
    "Rules:",
    "- Do not provide the final answer.",
    "- Do not provide a full worked solution.",
    "- Keep the response concise and actionable.",
    "- Ask prompts that make the student think.",
    "",
    "Help-level behavior:",
    levelDirective,
    "",
    "Context:",
    `- help_level=${params.activeHelpLevel}`,
    `- intermediate_calculations_used=${params.intermediateCalculationsUsed}`,
    `- conversation_turn_count=${params.conversationTurnCount}`,
  ].join("\n");
}

export const validateReasoningForUnlock = action({
  args: {
    attemptId: v.id("attempts"),
    questionId: v.id("questions"),
    reasoningText: v.string(),
  },
  returns: v.object({
    valid: v.boolean(),
    relevanceScore: v.number(),
    feedback: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ valid: boolean; relevanceScore: number; feedback: string }> => {
    await requireAuthFromAction(ctx);
    const attempt = await ctx.runQuery(api.attempts.getAttempt, { attemptId: args.attemptId });
    const question = await ctx.runQuery(api.questions.getById, {
      questionId: args.questionId,
    });
    if (!question || question._id !== attempt.questionId) {
      throw new Error("Question context mismatch.");
    }
    const reasoningText = args.reasoningText.trim();
    if (!reasoningText) {
      return {
        valid: false,
        relevanceScore: 0,
        feedback: "Write your reasoning first. Include the concept and your planned steps for this question.",
      };
    }
    if (looksLikeGibberish(reasoningText)) {
      return {
        valid: false,
        relevanceScore: 0,
        feedback: "Your reasoning appears unclear or random. Write meaningful, question-specific steps.",
      };
    }

    return analyzeReasoningRelevance({
      questionText: question.questionText,
      givenVariables: question.givenVariables,
      contentBlocks: question.contentBlocks,
      reasoningText,
    });
  },
}) as any;

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
    const activeHelpLevel = args.helpLevel ?? 1;
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
    if (!assignmentPolicy.allowedLevels.includes(activeHelpLevel)) {
      throw new Error(
        `Help Level ${activeHelpLevel} is not available for this assignment. Allowed levels: ${assignmentPolicy.allowedLevels.join(", ")}`,
      );
    }
    const reasoningText = (attempt.studentReasoning ?? "").trim();
    if (attempt.totalHelpRequests === 0) {
      if (!reasoningText) {
        throw new Error("AI is locked. Add your reasoning first, then validate it.");
      }
      const gate = await analyzeReasoningRelevance({
        questionText: question.questionText,
        givenVariables: question.givenVariables,
        contentBlocks: question.contentBlocks,
        reasoningText,
      });
      if (!gate.valid) {
        throw new Error(`AI is locked. ${gate.feedback} (Relevance score: ${gate.relevanceScore}%).`);
      }
    }

    const recentHelp = await ctx.runQuery(api.ai.getRecentHelpRequests, {
      attemptId: args.attemptId,
    });
    const now = Date.now();
    enforceHelpRequestPolicy({ recentHelp, now });
    if (looksLikeGibberish(args.studentInput)) {
      throw new Error("Please write your actual reasoning clearly before requesting help.");
    }
    if (requestsFinalAnswer(args.studentInput)) {
      throw new Error("Direct final-answer requests are blocked. Explain your approach first.");
    }

    const history = await ctx.runQuery(api.ai.getConversationHistory, {
      attemptId: args.attemptId,
    });

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
      let validation = validateAiResponse(aiResponse, activeHelpLevel);
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
        aiResponse = regenerated.text;
        tokensUsed = regenerated.totalTokenCount;
        validation = validateAiResponse(aiResponse, activeHelpLevel);
      }
      if (!validation.valid) {
        await ctx.runMutation(api.ai.logAiViolation, {
          attemptId: args.attemptId,
          helpLevel: activeHelpLevel,
          violations: validation.violations,
          severity: validation.severity,
          regenerationAttempt: RESPONSE_REGENERATION_LIMIT + 1,
        });
        aiResponse = getAiFallbackResponse(activeHelpLevel);
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
        helpLevel: activeHelpLevel,
        studentInput: args.studentInput,
        aiResponse,
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
        response: aiResponse,
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
    const reasoningText = (attempt.studentReasoning ?? "").trim();
    if (attempt.totalHelpRequests === 0) {
      if (!reasoningText) {
        throw new Error("AI is locked. Add your reasoning first, then validate it.");
      }
      const gate = await analyzeReasoningRelevance({
        questionText: question.questionText,
        givenVariables: question.givenVariables,
        contentBlocks: question.contentBlocks,
        reasoningText,
      });
      if (!gate.valid) {
        throw new Error(`AI is locked. ${gate.feedback} (Relevance score: ${gate.relevanceScore}%).`);
      }
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
    return 300;
  }
  if (helpLevel === 2 || helpLevel === 3) {
    return 400;
  }
  return 500;
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
