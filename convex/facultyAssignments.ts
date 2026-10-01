import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireRole, requireRoleFromAction } from "./lib/authGuards";
import { generateMultimodalWithFallback, generateTextWithFallback } from "./infrastructure/geminiClient";
import { validateDraftInput } from "./application/facultyDraftService";
import { requireSameOrganization } from "./infrastructure/organizationGuard";
import { logEvent } from "./infrastructure/logger";
import { enqueueAiJob } from "./infrastructure/aiQueue";
import { isFeatureEnabled } from "./infrastructure/featureFlags";
import { validateStrictAiQuestions } from "./domain/strictJsonValidation";
import {
  normalizeAiQuestions,
  parseAiQuestionResponse,
  type NormalizedAiQuestion,
} from "./domain/aiQuestionNormalization";
import {
  buildContentBlocksFromText,
  blocksToLegacyText,
  computeBlockMetrics,
  contentBlockValidator,
  normalizeLegacyQuestionToBlocks,
  validateContentBlocks,
} from "./domain/contentBlocks";

if (!process.env.GOOGLE_API_KEY) {
  throw new Error("Missing GOOGLE_API_KEY environment variable");
}

const subjectValidator = v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"));
const difficultyValidator = v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"));
const confidenceLevelValidator = v.union(v.literal("high"), v.literal("medium"), v.literal("low"));
const mcqOptionValidator = v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("D"));
const MCQ_OPTION_KEYS = ["A", "B", "C", "D"] as const;
const ASSIGNMENT_AI_TIMEOUT_MS = 180000;
const SEGMENT_CHUNK_CHARS = 12000;
const SEGMENT_OVERLAP_CHARS = 800;
const JOB_TIMEOUT_MS = 20 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 60 * 1000;

type McqOptionKey = (typeof MCQ_OPTION_KEYS)[number];

type AiQuestion = NormalizedAiQuestion;

const SEGMENTATION_PROMPT = `You are a faculty assignment processor.
The input may be either:
1. Existing assignment content that must be segmented into questions, or
2. A natural-language instruction asking you to CREATE an assignment.

If the input is an instruction, generate the requested questions. Infer a sensible question count
when none is specified (default 10), subject, topics, difficulty mix, and answers. Never return an
empty array merely because the input contains instructions instead of existing questions.

If the input contains existing questions, preserve and classify them rather than inventing replacements.
Return STRICT JSON array (no markdown) using this schema:
[
  {
    "question_text": "string",
    "question_type": "numerical|mcq|conceptual",
    "subject": "Physics|Chemistry|Math",
    "topic": "string",
    "difficulty_ai": "easy|medium|hard",
    "structured_representation": {
      "given_variables": ["string"],
      "target_variable": "string",
      "equation_category": "string",
      "assumptions": ["string"]
    },
    "mcq_options": ["option 1", "option 2", "option 3", "option 4"],
    "correct_option": "A|B|C|D",
    "ai_answer": "string",
    "confidence_level": "high|medium|low",
    "confidence_score": 0.0,
    "segmentation_confidence": 0.0
  }
]
Rules:
- For "mcq", ALWAYS include exactly 4 mcq_options and a correct_option.
- For non-mcq, omit mcq_options and correct_option.
- Preserve equation tokens in question_text exactly as provided (e.g. [EQ:\\int_0^1 x^2 dx]).
- Keep maximum 50 questions.`;

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function normalizeMcqOptions(raw: unknown): [string, string, string, string] | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return undefined;
  }
  const normalized = raw.map((value) => (typeof value === "string" ? value.trim() : ""));
  if (normalized.some((value) => value.length === 0)) {
    return undefined;
  }
  return normalized as [string, string, string, string];
}

function parseCorrectOption(raw: unknown): McqOptionKey | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const normalized = raw.trim().toUpperCase();
  if ((MCQ_OPTION_KEYS as readonly string[]).includes(normalized)) {
    return normalized as McqOptionKey;
  }
  return undefined;
}

function parseCorrectOptionFromText(raw: string | undefined): McqOptionKey | undefined {
  if (!raw) {
    return undefined;
  }
  const fromMarker = raw.match(/correct\s*answer[^A-D]*\(?([A-D])\)?/i);
  if (fromMarker?.[1]) {
    return fromMarker[1].toUpperCase() as McqOptionKey;
  }
  const fromPrefix = raw.match(/^\s*\(?([A-D])\)?(?:[\].:\-]|\s|$)/i);
  if (fromPrefix?.[1]) {
    return fromPrefix[1].toUpperCase() as McqOptionKey;
  }
  return undefined;
}

function parseInlineMcqOptions(questionText: string): { stem: string; options: [string, string, string, string] } | null {
  const inline = questionText.match(
    /^(.*?)\(\s*A\s*\)\s*([\s\S]*?)\s*\(\s*B\s*\)\s*([\s\S]*?)\s*\(\s*C\s*\)\s*([\s\S]*?)\s*\(\s*D\s*\)\s*([\s\S]*?)$/i,
  );
  if (!inline) {
    return null;
  }
  const stem = inline[1].trim();
  const optionD = inline[5].replace(/\s*Correct\s*Answer[\s\S]*$/i, "").trim();
  const options = [inline[2].trim(), inline[3].trim(), inline[4].trim(), optionD];
  if (!stem || options.some((value) => !value)) {
    return null;
  }
  return { stem, options: options as [string, string, string, string] };
}

function buildDraftQuestionFromAi(
  q: AiQuestion,
  idx: number,
  extractionSource: "pdf" | "text",
) {
  const questionType = (q.question_type ?? "").trim().toLowerCase();
  let questionText = (q.question_text ?? "").trim();
  questionText = questionText.replace(/\s*Correct\s*Answer[\s\S]*$/i, "").trim();

  let mcqOptions = normalizeMcqOptions(q.mcq_options);
  const inlineParsed = parseInlineMcqOptions(q.question_text ?? "");
  if (!mcqOptions && inlineParsed) {
    mcqOptions = inlineParsed.options;
    questionText = inlineParsed.stem;
  }

  let correctOption = parseCorrectOption(q.correct_option) ?? parseCorrectOptionFromText(q.ai_answer);
  if (!correctOption) {
    correctOption = parseCorrectOptionFromText(q.question_text);
  }

  const isMcq = questionType === "mcq";
  const normalizedMcqOptions = isMcq ? mcqOptions : undefined;
  const normalizedCorrectOption = isMcq ? correctOption : undefined;
  const contentBlocks = buildContentBlocksFromText(questionText || q.question_text || "");
  const blockValidation = validateContentBlocks(contentBlocks);
  if (!blockValidation.valid) {
    throw new Error(`Question ${idx + 1}: ${blockValidation.reason}`);
  }

  return {
    questionNumber: idx + 1,
    questionText: blocksToLegacyText(contentBlocks) || questionText || q.question_text,
    contentBlocks,
    questionType: q.question_type,
    subject: q.subject,
    topic: q.topic,
    difficulty: q.difficulty_ai,
    structuredRepresentation: JSON.stringify(q.structured_representation ?? {}),
    aiAnswer: q.ai_answer,
    correctAnswer: normalizedCorrectOption ?? (q.ai_answer?.trim() || undefined),
    mcqOptions: normalizedMcqOptions,
    correctOption: normalizedCorrectOption,
    confidenceLevel: q.confidence_level,
    confidenceScore: Math.max(0, Math.min(1, Number(q.confidence_score ?? 0))),
    generationMethod: "llm",
    reviewed: false,
    editedByFaculty: false,
    segmentationConfidence: Math.max(0, Math.min(1, Number(q.segmentation_confidence ?? 0))),
    extractionSource,
  };
}

function serializeBlocksForSegmentation(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const blocks = buildContentBlocksFromText(line);
      if (blocks.length === 0) {
        return "";
      }
      return blocks.map((block) => {
        if (block.type === "text") {
          return block.value;
        }
        return `[EQ:${block.value}]`;
      }).join(" ").trim();
    })
    .filter(Boolean)
    .join("\n");
}

function emitIngestionMetrics(questions: Array<{ contentBlocks?: ReturnType<typeof normalizeLegacyQuestionToBlocks> }>) {
  const totalQuestions = questions.length;
  if (!totalQuestions) {
    return {
      questionsNeedingReviewPct: 0,
      conversionFailurePct: 0,
      splitQuestionPct: 0,
      avgBlocksPerQuestion: 0,
    };
  }

  let questionsWithReview = 0;
  let totalEquationBlocks = 0;
  let failedEquationBlocks = 0;
  let splitQuestions = 0;
  let totalBlocks = 0;

  for (const question of questions) {
    const blocks = question.contentBlocks ?? [];
    totalBlocks += blocks.length;
    if (blocks.length > 1) {
      splitQuestions += 1;
    }
    const metrics = computeBlockMetrics(blocks);
    totalEquationBlocks += metrics.equationBlocks;
    failedEquationBlocks += metrics.needsReviewBlocks;
    if (metrics.needsReviewBlocks > 0) {
      questionsWithReview += 1;
    }
  }

  return {
    questionsNeedingReviewPct: Number(((questionsWithReview / totalQuestions) * 100).toFixed(2)),
    conversionFailurePct: totalEquationBlocks > 0
      ? Number(((failedEquationBlocks / totalEquationBlocks) * 100).toFixed(2))
      : 0,
    splitQuestionPct: Number(((splitQuestions / totalQuestions) * 100).toFixed(2)),
    avgBlocksPerQuestion: Number((totalBlocks / totalQuestions).toFixed(2)),
  };
}

async function callGemini(modelName: string, prompt: string, mimeType?: string, dataBase64?: string) {
  const maxOutputTokens = modelName.includes("2.0-flash") ? 8192 : 50000;
  if (mimeType && dataBase64) {
    const result = await generateMultimodalWithFallback({
      promptParts: [
        { text: prompt },
        { inlineData: { mimeType, data: dataBase64 } },
      ],
      candidateModels: [modelName],
      temperature: 0.2,
      maxOutputTokens,
      timeoutMs: ASSIGNMENT_AI_TIMEOUT_MS,
      retryQuotaOnce: true,
    });
    return result.text;
  }
  const result = await generateTextWithFallback({
    prompt,
    candidateModels: [modelName],
    temperature: 0.2,
    maxOutputTokens,
    timeoutMs: ASSIGNMENT_AI_TIMEOUT_MS,
    retryQuotaOnce: true,
  });
  return result.text;
}

async function callGeminiWithFallback(
  prompt: string,
  mimeType?: string,
  dataBase64?: string,
): Promise<string> {
  const candidateModels = [(process.env.GEMINI_MODEL || "gemini-3.5-flash")];
  if (mimeType && dataBase64) {
    const result = await generateMultimodalWithFallback({
      promptParts: [
        { text: prompt },
        { inlineData: { mimeType, data: dataBase64 } },
      ],
      candidateModels,
      temperature: 0.2,
      maxOutputTokens: 50000,
      timeoutMs: ASSIGNMENT_AI_TIMEOUT_MS,
      retryQuotaOnce: true,
    });
    return result.text;
  }
  const result = await generateTextWithFallback({
    prompt,
    candidateModels,
    temperature: 0.2,
    maxOutputTokens: 50000,
    timeoutMs: ASSIGNMENT_AI_TIMEOUT_MS,
    retryQuotaOnce: true,
  });
  return result.text;
}

function splitTextForSegmentation(text: string, chunkSize = SEGMENT_CHUNK_CHARS, overlap = SEGMENT_OVERLAP_CHARS): string[] {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= chunkSize) {
    return [cleaned];
  }
  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const hardEnd = Math.min(cleaned.length, start + chunkSize);
    let end = hardEnd;
    if (hardEnd < cleaned.length) {
      const boundary = cleaned.lastIndexOf("\n", hardEnd);
      if (boundary > start + Math.floor(chunkSize * 0.6)) {
        end = boundary;
      }
    }
    const slice = cleaned.slice(start, end).trim();
    if (slice) {
      chunks.push(slice);
    }
    if (end >= cleaned.length) {
      break;
    }
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function normalizeQuestionFingerprint(questionText: string): string {
  return questionText.toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s]/g, "").trim().slice(0, 180);
}

async function segmentAssignmentTextWithFallback(
  extractedText: string,
  onChunkStart?: (index: number, total: number) => Promise<void>,
): Promise<AiQuestion[]> {
  const chunks = splitTextForSegmentation(extractedText);
  const merged: AiQuestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < chunks.length; i += 1) {
    if (onChunkStart) {
      await onChunkStart(i, chunks.length);
    }
    const chunk = chunks[i];
    const preparedChunk = serializeBlocksForSegmentation(chunk);
    const segmentationPrompt = `${SEGMENTATION_PROMPT}\n\nChunk ${i + 1} of ${chunks.length}:\n${preparedChunk}`;
    const raw = await callGeminiWithFallback(segmentationPrompt);
    let parsed = normalizeAiQuestions(parseAiQuestionResponse(raw));
    if (parsed.length === 0) {
      const retryPrompt = `${SEGMENTATION_PROMPT}

Your previous response contained no usable questions. Create a non-empty assignment from this input.
Use "question_text" for every question and return only the JSON array.

Input:
${preparedChunk}`;
      parsed = normalizeAiQuestions(parseAiQuestionResponse(await callGeminiWithFallback(retryPrompt)));
    }
    for (const q of parsed) {
      const key = normalizeQuestionFingerprint(q.question_text ?? "");
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(q);
      if (merged.length >= 50) {
        return merged;
      }
    }
  }

  return merged;
}

async function requireLecturer(ctx: any) {
  const userId = await requireRole(ctx, "lecturer");
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  if (!profile?.organizationId) {
    throw new Error("User is not associated with an organization");
  }
  return { userId, organizationId: profile.organizationId };
}

export const generatePdfUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireLecturer(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createDraftFromInput = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    timeLimitMinutes: v.number(),
    minReasoningChars: v.optional(v.number()),
    allowedLevels: v.array(v.number()),
    classroomId: v.optional(v.id("classrooms")),
    inputType: v.union(v.literal("pdf"), v.literal("text")),
    sourceText: v.optional(v.string()),
    sourceStorageId: v.optional(v.id("_storage")),
    sourceHash: v.optional(v.string()),
    uploadRequestKey: v.string(),
  },
  returns: v.object({
    assignmentId: v.id("assignments"),
    jobId: v.id("facultyAssignmentJobs"),
  }),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireLecturer(ctx);
    const now = Date.now();
    const normalizedTitle = args.title.trim();
    logEvent({
      event: "faculty.draft.create_from_input.started",
      organizationId,
      payload: { facultyId: String(userId), inputType: args.inputType },
    });

    if (args.inputType === "text") {
      const normalized = (args.sourceText ?? "").replace(/\s+/g, " ").trim();
      if (normalized.length < 100) {
        throw new Error("Text input is too short. Please provide at least 100 characters.");
      }
    } else if (!args.sourceStorageId) {
      throw new Error("PDF source is required.");
    }
    if (!args.classroomId) {
      throw new Error("Please select a classroom.");
    }
    if (args.classroomId) {
      const classroom = await ctx.db.get(args.classroomId);
      if (!classroom) {
        throw new Error("Selected classroom was not found.");
      }
      requireSameOrganization(classroom.organizationId, organizationId);
      if (classroom.lecturerId !== userId) {
        throw new Error("You can assign only to your own classrooms.");
      }
    }

    await ctx.runMutation(internal.facultyAssignments.expireStaleProcessingJobsForFacultyInternal, {
      organizationId,
      facultyId: userId,
      timeoutMs: JOB_TIMEOUT_MS,
    });

    if (args.uploadRequestKey.trim()) {
      const existingByRequest = await ctx.db
        .query("facultyAssignmentJobs")
        .withIndex("by_org_faculty_upload_key", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("facultyId", userId)
            .eq("uploadRequestKey", args.uploadRequestKey.trim()),
        )
        .collect();
      const activeExisting = existingByRequest
        .filter((job) => job.status === "pending" || job.status === "processing")
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (activeExisting) {
        return { assignmentId: activeExisting.assignmentId, jobId: activeExisting._id };
      }
    }

    if (args.sourceHash?.trim()) {
      const recentByHash = await ctx.db
        .query("facultyAssignmentJobs")
        .withIndex("by_org_faculty_sourcehash_created", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("facultyId", userId)
            .eq("sourceHash", args.sourceHash!.trim()),
        )
        .collect();
      const recentDuplicate = recentByHash
        .filter((job) => now - job.createdAt <= DUPLICATE_WINDOW_MS)
        .filter((job) => job.status === "pending" || job.status === "processing")
        .filter((job) => (job.sourceTitleNormalized ?? "") === normalizedTitle.toLowerCase())
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (recentDuplicate) {
        return { assignmentId: recentDuplicate.assignmentId, jobId: recentDuplicate._id };
      }
    }

    const assignmentId = await ctx.db.insert("assignments", {
      organizationId,
      lecturerId: userId,
      classroomId: args.classroomId,
      title: normalizedTitle,
      description: args.description,
      timeLimitMinutes: args.timeLimitMinutes,
      minReasoningChars: Math.max(0, Math.floor(args.minReasoningChars ?? 30)),
      totalQuestions: 0,
      allowedLevels: args.allowedLevels,
      isActive: false,
      aiProcessingStatus: "processing",
    });

    const jobId = await ctx.db.insert("facultyAssignmentJobs", {
      organizationId,
      assignmentId,
      facultyId: userId,
      status: "pending",
      inputType: args.inputType,
      sourceStorageId: args.sourceStorageId,
      sourceText: args.sourceText,
      uploadRequestKey: args.uploadRequestKey.trim(),
      sourceHash: args.sourceHash?.trim(),
      sourceTitleNormalized: normalizedTitle.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(assignmentId, {
      aiJobId: jobId,
    });

    console.log("[facultyAssignments] enqueue processDraftJob", { assignmentId, jobId });
    logEvent({
      event: "faculty.draft.create_from_input.queued",
      organizationId,
      payload: { assignmentId: String(assignmentId), jobId: String(jobId) },
    });
    await enqueueAiJob({
      organizationId: organizationId.toString(),
      scheduler: ctx.scheduler,
      delayMs: 0,
      fnRef: internal.facultyAssignments.processDraftJob,
      args: { jobId },
      fallback: async () => {
        await ctx.scheduler.runAfter(0, internal.facultyAssignments.processDraftJob, { jobId });
      },
    });
    return { assignmentId, jobId };
  },
});

export const createDraftRecord = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    timeLimitMinutes: v.number(),
    minReasoningChars: v.optional(v.number()),
    allowedLevels: v.array(v.number()),
    classroomId: v.optional(v.id("classrooms")),
    inputType: v.union(v.literal("pdf"), v.literal("text")),
    sourceTextLength: v.optional(v.number()),
    pdfSizeBytes: v.optional(v.number()),
    sourceText: v.optional(v.string()),
    sourceStorageId: v.optional(v.id("_storage")),
    sourceHash: v.optional(v.string()),
    uploadRequestKey: v.string(),
  },
  returns: v.object({
    assignmentId: v.id("assignments"),
    jobId: v.id("facultyAssignmentJobs"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ assignmentId: Id<"assignments">; jobId: Id<"facultyAssignmentJobs"> }> => {
    const { userId } = await requireLecturer(ctx);
    validateDraftInput({
      inputType: args.inputType,
      sourceTextLength: args.sourceTextLength,
      allowedLevels: args.allowedLevels,
    });
    if (!args.classroomId) {
      throw new Error("Please select a classroom.");
    }

    return await ctx.runMutation(internal.facultyAssignments.createDraftRecordInternal as any, {
      title: args.title,
      description: args.description,
      timeLimitMinutes: args.timeLimitMinutes,
      minReasoningChars: args.minReasoningChars,
      allowedLevels: args.allowedLevels,
      classroomId: args.classroomId,
      inputType: args.inputType,
      facultyId: userId,
      sourceText: args.sourceText,
      sourceStorageId: args.sourceStorageId,
      sourceHash: args.sourceHash,
      uploadRequestKey: args.uploadRequestKey,
    });
  },
});

export const createDraftRecordInternal = internalMutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    timeLimitMinutes: v.number(),
    minReasoningChars: v.optional(v.number()),
    allowedLevels: v.array(v.number()),
    classroomId: v.optional(v.id("classrooms")),
    inputType: v.union(v.literal("pdf"), v.literal("text")),
    facultyId: v.id("users"),
    sourceText: v.optional(v.string()),
    sourceStorageId: v.optional(v.id("_storage")),
    sourceHash: v.optional(v.string()),
    uploadRequestKey: v.string(),
  },
  returns: v.object({
    assignmentId: v.id("assignments"),
    jobId: v.id("facultyAssignmentJobs"),
  }),
  handler: async (ctx, args) => {
    if (!args.facultyId) {
      throw new Error("Unauthorized");
    }
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.facultyId))
      .first();
    if (!profile || profile.role !== "lecturer") {
      throw new Error("Only lecturers can perform this action");
    }
    const now = Date.now();
    const normalizedTitle = args.title.trim();
    const userId = args.facultyId;
    const organizationId = profile.organizationId;
    if (!args.classroomId) {
      throw new Error("Please select a classroom.");
    }
    if (args.classroomId) {
      const classroom = await ctx.db.get(args.classroomId);
      if (!classroom) {
        throw new Error("Selected classroom was not found.");
      }
      requireSameOrganization(classroom.organizationId, organizationId);
      if (classroom.lecturerId !== userId) {
        throw new Error("You can assign only to your own classrooms.");
      }
    }

    await ctx.runMutation(internal.facultyAssignments.expireStaleProcessingJobsForFacultyInternal, {
      organizationId,
      facultyId: userId,
      timeoutMs: JOB_TIMEOUT_MS,
    });

    const existingByRequest = await ctx.db
      .query("facultyAssignmentJobs")
      .withIndex("by_org_faculty_upload_key", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("facultyId", userId)
          .eq("uploadRequestKey", args.uploadRequestKey.trim()),
      )
      .collect();
    const activeExistingByKey = existingByRequest
      .filter((job) => job.status === "pending" || job.status === "processing")
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (activeExistingByKey) {
      return { assignmentId: activeExistingByKey.assignmentId, jobId: activeExistingByKey._id };
    }

    if (args.sourceHash?.trim()) {
      const now = Date.now();
      const recentByHash = await ctx.db
        .query("facultyAssignmentJobs")
        .withIndex("by_org_faculty_sourcehash_created", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("facultyId", userId)
            .eq("sourceHash", args.sourceHash!.trim()),
        )
        .collect();
      const recentDuplicate = recentByHash
        .filter((job) => now - job.createdAt <= DUPLICATE_WINDOW_MS)
        .filter((job) => job.status === "pending" || job.status === "processing")
        .filter((job) => (job.sourceTitleNormalized ?? "") === normalizedTitle.toLowerCase())
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (recentDuplicate) {
        return { assignmentId: recentDuplicate.assignmentId, jobId: recentDuplicate._id };
      }
    }

    const assignmentId = await ctx.db.insert("assignments", {
      organizationId,
      lecturerId: userId,
      classroomId: args.classroomId,
      title: normalizedTitle,
      description: args.description,
      timeLimitMinutes: args.timeLimitMinutes,
      minReasoningChars: Math.max(0, Math.floor(args.minReasoningChars ?? 30)),
      totalQuestions: 0,
      allowedLevels: args.allowedLevels,
      isActive: false,
      aiProcessingStatus: "processing",
    });
    const jobId = await ctx.db.insert("facultyAssignmentJobs", {
      organizationId,
      assignmentId,
      facultyId: userId,
      status: "pending",
      inputType: args.inputType,
      sourceText: args.sourceText,
      sourceStorageId: args.sourceStorageId,
      uploadRequestKey: args.uploadRequestKey.trim(),
      sourceHash: args.sourceHash?.trim(),
      sourceTitleNormalized: normalizedTitle.toLowerCase(),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(assignmentId, { aiJobId: jobId });
    return { assignmentId, jobId };
  },
});

export const startDirectAiDraftProcessing = action({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    timeLimitMinutes: v.number(),
    allowedLevels: v.array(v.number()),
    classroomId: v.optional(v.id("classrooms")),
    inputType: v.union(v.literal("pdf"), v.literal("text")),
    sourceText: v.optional(v.string()),
    pdfBase64: v.optional(v.string()),
    sourceHash: v.optional(v.string()),
    uploadRequestKey: v.string(),
  },
  returns: v.object({
    assignmentId: v.id("assignments"),
    jobId: v.id("facultyAssignmentJobs"),
    status: v.union(v.literal("completed"), v.literal("failed")),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    assignmentId: Id<"assignments">;
    jobId: Id<"facultyAssignmentJobs">;
    status: "completed" | "failed";
  }> => {
    const facultyId = await requireRoleFromAction(ctx, "lecturer");
    const record: {
      assignmentId: Id<"assignments">;
      jobId: Id<"facultyAssignmentJobs">;
    } = await ctx.runMutation(internal.facultyAssignments.createDraftRecordInternal, {
      title: args.title,
      description: args.description,
      timeLimitMinutes: args.timeLimitMinutes,
      allowedLevels: args.allowedLevels,
      classroomId: args.classroomId,
      inputType: args.inputType,
      facultyId,
      sourceHash: args.sourceHash,
      uploadRequestKey: args.uploadRequestKey,
    });
    const assignmentId: Id<"assignments"> = record.assignmentId;
    const jobId: Id<"facultyAssignmentJobs"> = record.jobId;
    const currentUser = await ctx.runQuery(api.users.loggedInUserWithProfile, {});
    const currentOrg = currentUser?.profile?.organizationId;
    if (currentOrg) {
      logEvent({
        event: "faculty.draft.direct_processing.started",
        organizationId: currentOrg,
        payload: { assignmentId: String(assignmentId), jobId: String(jobId) },
      });
    }
    console.log("[facultyAssignments] direct processing start", { assignmentId, jobId, inputType: args.inputType });

    try {
      let extractedText = "";
      if (args.inputType === "text") {
        extractedText = (args.sourceText ?? "").replace(/\s+/g, " ").trim();
        if (extractedText.length < 100) {
          throw new Error("Text input is too short. Please provide at least 100 characters.");
        }
      } else {
        const pdfBase64 = args.pdfBase64;
        if (!pdfBase64) {
          throw new Error("Missing PDF payload.");
        }
        const extractionPrompt =
          "Extract assignment content in layout-aware plain text. Preserve reading order, line breaks, question numbering, and mathematical expressions exactly. Remove repeated headers/footers/page numbers. Return plain text only.";
        console.log("[facultyAssignments] direct gemini extraction request", { assignmentId, jobId });
        extractedText = await callGeminiWithFallback(
          extractionPrompt,
          "application/pdf",
          pdfBase64,
        );
        console.log("[facultyAssignments] direct gemini extraction response", { assignmentId, jobId, chars: extractedText.length });
      }

      console.log("[facultyAssignments] direct gemini segmentation request", { assignmentId, jobId });
      const parsed = await segmentAssignmentTextWithFallback(extractedText);
      if (currentOrg && isFeatureEnabled("strictJsonValidation", currentOrg)) {
        const strictValidation = validateStrictAiQuestions(parsed);
        if (!strictValidation.valid) {
          throw new Error(`Strict JSON validation failed: ${strictValidation.errors.join("; ")}`);
        }
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("No questions extracted by AI. Try shorter text input or split into smaller assignments.");
      }
      if (parsed.length > 50) {
        throw new Error("Extraction produced more than 50 questions.");
      }

      const draftQuestions = parsed.map((q, idx) => buildDraftQuestionFromAi(q, idx, args.inputType));
      await ctx.runMutation(internal.facultyAssignments.replaceQuestionsForDraftInternal, {
        assignmentId,
        questions: draftQuestions,
      });
      const metrics = emitIngestionMetrics(draftQuestions);
      if (currentOrg) {
        logEvent({
          event: "faculty.draft.ingestion.metrics",
          organizationId: currentOrg,
          payload: {
            assignmentId: String(assignmentId),
            jobId: String(jobId),
            ...metrics,
          },
        });
      }
      await ctx.runMutation(internal.facultyAssignments.completeJobInternal, {
        jobId,
        extractedText,
        processedQuestions: parsed.length,
      });
      await ctx.runMutation(internal.facultyAssignments.updateAssignmentAiStatusInternal, {
        assignmentId,
        status: "review_ready",
      });
      return { assignmentId, jobId, status: "completed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown processing error";
      await ctx.runMutation(internal.facultyAssignments.failJobInternal, {
        jobId,
        error: message,
      });
      await ctx.runMutation(internal.facultyAssignments.updateAssignmentAiStatusInternal, {
        assignmentId,
        status: "failed",
        error: message,
      });
      return { assignmentId, jobId, status: "failed" };
    }
  },
});

export const processDirectDraftJob = action({
  args: {
    assignmentId: v.id("assignments"),
    jobId: v.id("facultyAssignmentJobs"),
    inputType: v.union(v.literal("pdf"), v.literal("text")),
    sourceText: v.optional(v.string()),
    pdfBase64: v.optional(v.string()),
  },
  returns: v.object({
    assignmentId: v.id("assignments"),
    jobId: v.id("facultyAssignmentJobs"),
    status: v.union(v.literal("completed"), v.literal("failed")),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    assignmentId: Id<"assignments">;
    jobId: Id<"facultyAssignmentJobs">;
    status: "completed" | "failed";
  }> => {
    await requireRoleFromAction(ctx, "lecturer");
    const assignment: Array<{ _id: Id<"assignments"> }> = await ctx.runQuery(
      api.assignments.getLecturerAssignments,
      {},
    );
    const exists = assignment.some((a: { _id: Id<"assignments"> }) => a._id === args.assignmentId);
    if (!exists) {
      throw new Error("Assignment not found or access denied.");
    }
    const currentUser = await ctx.runQuery(api.users.loggedInUserWithProfile, {});
    if (!currentUser?.profile?.organizationId) {
      throw new Error("User organization not found");
    }
    const job: { assignmentId: Id<"assignments">; organizationId: Id<"organizations"> } | null = await ctx.runQuery(
      internal.facultyAssignments.getJobByIdInternal,
      {
        jobId: args.jobId,
        expectedOrganizationId: currentUser.profile.organizationId,
      },
    );
    if (!job || job.assignmentId !== args.assignmentId) {
      throw new Error("Processing job not found.");
    }

    await ctx.runMutation(internal.facultyAssignments.updateJobStatusInternal, {
      jobId: args.jobId,
      status: "processing",
    });
    await ctx.runMutation(internal.facultyAssignments.updateAssignmentAiStatusInternal, {
      assignmentId: args.assignmentId,
      status: "processing",
      error: undefined,
    });

    try {
      let extractedText = "";
      if (args.inputType === "text") {
        await ctx.runMutation(internal.facultyAssignments.touchJobHeartbeatInternal, {
          jobId: args.jobId,
        });
        extractedText = (args.sourceText ?? "").replace(/\s+/g, " ").trim();
        if (extractedText.length < 100) {
          throw new Error("Text input is too short. Please provide at least 100 characters.");
        }
      } else {
        const pdfBase64 = args.pdfBase64;
        if (!pdfBase64) {
          throw new Error("Missing PDF payload.");
        }
        const extractionPrompt =
          "Extract assignment content in layout-aware plain text. Preserve reading order, line breaks, question numbering, and mathematical expressions exactly. Remove repeated headers/footers/page numbers. Return plain text only.";
        await ctx.runMutation(internal.facultyAssignments.touchJobHeartbeatInternal, {
          jobId: args.jobId,
        });
        extractedText = await callGeminiWithFallback(extractionPrompt, "application/pdf", pdfBase64);
      }

      const parsed = await segmentAssignmentTextWithFallback(extractedText, async () => {
        await ctx.runMutation(internal.facultyAssignments.touchJobHeartbeatInternal, {
          jobId: args.jobId,
        });
      });
      if (isFeatureEnabled("strictJsonValidation", job.organizationId)) {
        const strictValidation = validateStrictAiQuestions(parsed);
        if (!strictValidation.valid) {
          throw new Error(`Strict JSON validation failed: ${strictValidation.errors.join("; ")}`);
        }
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("No questions extracted by AI. Try shorter text input or split into smaller assignments.");
      }
      if (parsed.length > 50) {
        throw new Error("Extraction produced more than 50 questions.");
      }

      const draftQuestions = parsed.map((q, idx) => buildDraftQuestionFromAi(q, idx, args.inputType));
      await ctx.runMutation(internal.facultyAssignments.replaceQuestionsForDraftInternal, {
        assignmentId: args.assignmentId,
        questions: draftQuestions,
      });
      const metrics = emitIngestionMetrics(draftQuestions);
      logEvent({
        event: "faculty.draft.ingestion.metrics",
        organizationId: job.organizationId,
        payload: {
          assignmentId: String(args.assignmentId),
          jobId: String(args.jobId),
          ...metrics,
        },
      });
      await ctx.runMutation(internal.facultyAssignments.completeJobInternal, {
        jobId: args.jobId,
        extractedText,
        processedQuestions: parsed.length,
      });
      await ctx.runMutation(internal.facultyAssignments.updateAssignmentAiStatusInternal, {
        assignmentId: args.assignmentId,
        status: "review_ready",
      });
      return { assignmentId: args.assignmentId, jobId: args.jobId, status: "completed" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown processing error";
      await ctx.runMutation(internal.facultyAssignments.failJobInternal, {
        jobId: args.jobId,
        error: message,
      });
      await ctx.runMutation(internal.facultyAssignments.updateAssignmentAiStatusInternal, {
        assignmentId: args.assignmentId,
        status: "failed",
        error: message,
      });
      return { assignmentId: args.assignmentId, jobId: args.jobId, status: "failed" };
    }
  },
});

export const processDraftJob = internalAction({
  args: {
    jobId: v.id("facultyAssignmentJobs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log("[facultyAssignments] processDraftJob start", { jobId: args.jobId });
    const job = await ctx.runQuery(internal.facultyAssignments.getJobByIdInternal, { jobId: args.jobId });
    if (!job) {
      console.log("[facultyAssignments] processDraftJob job-not-found", { jobId: args.jobId });
      return null;
    }

    await ctx.runMutation(internal.facultyAssignments.updateJobStatusInternal, {
      jobId: args.jobId,
      status: "processing",
    });
    await ctx.runMutation(internal.facultyAssignments.updateAssignmentAiStatusInternal, {
      assignmentId: job.assignmentId,
      status: "processing",
    });

    try {
      let extractedText = "";
      if (job.inputType === "text") {
        await ctx.runMutation(internal.facultyAssignments.touchJobHeartbeatInternal, {
          jobId: args.jobId,
        });
        extractedText = (job.sourceText ?? "").replace(/\s+/g, " ").trim();
      } else {
        if (!job.sourceStorageId) {
          throw new Error("Missing PDF storage id.");
        }
        const fileUrl = await ctx.storage.getUrl(job.sourceStorageId);
        if (!fileUrl) {
          throw new Error("Could not access uploaded PDF.");
        }
        const response = await fetch(fileUrl);
        const pdfBytes = await response.arrayBuffer();
        const pdfBase64 = bytesToBase64(new Uint8Array(pdfBytes));
        const extractionPrompt =
          "Extract assignment content in layout-aware plain text. Preserve reading order, line breaks, question numbering, and mathematical expressions exactly. Remove repeated headers/footers/page numbers. Return plain text only.";
        console.log("[facultyAssignments] processDraftJob gemini extraction request", {
          jobId: args.jobId,
          assignmentId: job.assignmentId,
        });
        await ctx.runMutation(internal.facultyAssignments.touchJobHeartbeatInternal, {
          jobId: args.jobId,
        });
        extractedText = await callGeminiWithFallback(extractionPrompt, "application/pdf", pdfBase64);
        console.log("[facultyAssignments] processDraftJob gemini extraction response", {
          jobId: args.jobId,
          chars: extractedText.length,
        });
      }

      console.log("[facultyAssignments] processDraftJob gemini segmentation request", {
        jobId: args.jobId,
        assignmentId: job.assignmentId,
      });
      const parsed = await segmentAssignmentTextWithFallback(extractedText, async () => {
        await ctx.runMutation(internal.facultyAssignments.touchJobHeartbeatInternal, {
          jobId: args.jobId,
        });
      });
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("No questions extracted by AI. Try shorter text input or split into smaller assignments.");
      }
      if (parsed.length > 50) {
        throw new Error("Extraction produced more than 50 questions.");
      }

      console.log("[facultyAssignments] processDraftJob before questions mutation", {
        jobId: args.jobId,
        questions: parsed.length,
      });
      const draftQuestions = parsed.map((q, idx) => buildDraftQuestionFromAi(q, idx, job.inputType));
      await ctx.runMutation(internal.facultyAssignments.replaceQuestionsForDraftInternal, {
        assignmentId: job.assignmentId,
        questions: draftQuestions,
      });
      const metrics = emitIngestionMetrics(draftQuestions);
      logEvent({
        event: "faculty.draft.ingestion.metrics",
        organizationId: job.organizationId,
        payload: {
          assignmentId: String(job.assignmentId),
          jobId: String(args.jobId),
          ...metrics,
        },
      });

      await ctx.runMutation(internal.facultyAssignments.completeJobInternal, {
        jobId: args.jobId,
        extractedText,
        processedQuestions: parsed.length,
      });
      await ctx.runMutation(internal.facultyAssignments.updateAssignmentAiStatusInternal, {
        assignmentId: job.assignmentId,
        status: "review_ready",
      });
      console.log("[facultyAssignments] processDraftJob completed", {
        jobId: args.jobId,
        assignmentId: job.assignmentId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown processing error";
      console.log("[facultyAssignments] processDraftJob failed", {
        jobId: args.jobId,
        assignmentId: job.assignmentId,
        error: message,
      });
      await ctx.runMutation(internal.facultyAssignments.failJobInternal, {
        jobId: args.jobId,
        error: message,
      });
      await ctx.runMutation(internal.facultyAssignments.updateAssignmentAiStatusInternal, {
        assignmentId: job.assignmentId,
        status: "failed",
        error: message,
      });
    }

    return null;
  },
});

export const getDraftStatus = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.union(
    v.object({
      _id: v.id("facultyAssignmentJobs"),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("review_ready"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("failed_timeout"),
      ),
      processedQuestions: v.optional(v.number()),
      error: v.optional(v.string()),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireLecturer(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (
      !assignment ||
      assignment.lecturerId !== userId ||
      assignment.organizationId !== organizationId
    ) {
      throw new Error("Assignment not found or access denied");
    }
    let job = assignment.aiJobId ? await ctx.db.get(assignment.aiJobId) : null;
    if (
      !job ||
      job.assignmentId !== args.assignmentId ||
      job.organizationId !== organizationId
    ) {
      const jobs = await ctx.db
        .query("facultyAssignmentJobs")
        .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
        .collect();
      job = jobs
        .filter((candidate) => candidate.organizationId === organizationId)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    }
    if (!job) {
      return null;
    }
    return {
      _id: job._id,
      status: job.status,
      processedQuestions: job.processedQuestions,
      error: job.error,
      updatedAt: job.updatedAt,
    };
  },
});

export const getDraftReviewQuestions = query({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.array(
    v.object({
      _id: v.id("questions"),
      questionNumber: v.number(),
      questionText: v.string(),
      contentBlocks: v.optional(v.array(contentBlockValidator)),
      editedText: v.optional(v.string()),
      questionType: v.optional(v.string()),
      mcqOptions: v.optional(v.array(v.string())),
      correctOption: v.optional(mcqOptionValidator),
      subject: subjectValidator,
      topic: v.string(),
      difficulty: difficultyValidator,
      structuredRepresentation: v.optional(v.string()),
      correctAnswer: v.optional(v.string()),
      aiAnswer: v.optional(v.string()),
      confidenceLevel: v.optional(confidenceLevelValidator),
      confidenceScore: v.optional(v.number()),
      generationMethod: v.optional(v.string()),
      reviewed: v.optional(v.boolean()),
      segmentationConfidence: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireLecturer(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (
      !assignment ||
      assignment.lecturerId !== userId ||
      assignment.organizationId !== organizationId
    ) {
      throw new Error("Assignment not found or access denied");
    }
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .order("asc")
      .collect();
    return questions.map((q) => {
      const qAny = q as typeof q & {
        mcqOptions?: string[];
        correctOption?: McqOptionKey;
      };
      return {
        _id: q._id,
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        contentBlocks: q.contentBlocks ?? normalizeLegacyQuestionToBlocks(q.questionText ?? ""),
        editedText: q.editedText,
        questionType: q.questionType,
        mcqOptions: qAny.mcqOptions,
        correctOption: qAny.correctOption,
        subject: q.subject,
        topic: q.topic,
        difficulty: q.difficulty,
        structuredRepresentation: q.structuredRepresentation,
        correctAnswer: q.correctAnswer,
        aiAnswer: q.aiAnswer,
        confidenceLevel: q.confidenceLevel,
        confidenceScore: q.confidenceScore,
        generationMethod: q.generationMethod,
        reviewed: q.reviewed,
        segmentationConfidence: q.segmentationConfidence,
      };
    });
  },
});

export const updateDraftQuestion = mutation({
  args: {
    questionId: v.id("questions"),
    questionText: v.string(),
    contentBlocks: v.optional(v.array(contentBlockValidator)),
    questionType: v.optional(v.string()),
    mcqOptions: v.optional(v.array(v.string())),
    correctOption: v.optional(mcqOptionValidator),
    subject: subjectValidator,
    topic: v.string(),
    difficulty: difficultyValidator,
    structuredRepresentation: v.optional(v.string()),
    correctAnswer: v.optional(v.string()),
    aiAnswer: v.optional(v.string()),
    reviewed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireLecturer(ctx);
    const question = await ctx.db.get(args.questionId);
    if (!question) {
      throw new Error("Question not found");
    }
    const assignment = await ctx.db.get(question.assignmentId);
    if (
      !assignment ||
      assignment.lecturerId !== userId ||
      assignment.organizationId !== organizationId
    ) {
      throw new Error("Access denied");
    }
    const normalizedType = (args.questionType ?? "").trim().toLowerCase();
    const isMcq = normalizedType === "mcq";
    const normalizedBlocks = args.contentBlocks ?? buildContentBlocksFromText(args.questionText);
    const blockValidation = validateContentBlocks(normalizedBlocks);
    if (!blockValidation.valid) {
      throw new Error(blockValidation.reason);
    }
    if (isMcq) {
      if (!args.mcqOptions || args.mcqOptions.length !== 4 || args.mcqOptions.some((opt) => !opt.trim())) {
        throw new Error("MCQ questions must have exactly 4 non-empty options.");
      }
      if (!args.correctOption) {
        throw new Error("MCQ questions must include a correct option.");
      }
    }
    await ctx.db.patch(args.questionId, {
      editedText: args.questionText,
      questionText: args.questionText,
      contentBlocks: normalizedBlocks,
      questionType: args.questionType,
      mcqOptions: isMcq ? args.mcqOptions : undefined,
      correctOption: isMcq ? args.correctOption : undefined,
      subject: args.subject,
      topic: args.topic,
      difficulty: args.difficulty,
      structuredRepresentation: args.structuredRepresentation,
      correctAnswer: args.correctAnswer,
      aiAnswer: args.aiAnswer,
      reviewed: args.reviewed,
      reviewedAt: args.reviewed ? Date.now() : undefined,
      editedByFaculty: true,
    });
    return null;
  },
});

export const addManualDraftQuestion = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.id("questions"),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireLecturer(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (
      !assignment ||
      assignment.lecturerId !== userId ||
      assignment.organizationId !== organizationId
    ) {
      throw new Error("Assignment not found or access denied");
    }
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();
    if (questions.length >= 50) {
      throw new Error("Maximum 50 questions allowed.");
    }
    const questionId = await ctx.db.insert("questions", {
      assignmentId: args.assignmentId,
      questionNumber: questions.length + 1,
      questionText: "New question",
      contentBlocks: [{ type: "text", value: "New question" }],
      questionType: "manual",
      subject: "Physics",
      topic: "General",
      difficulty: "medium",
      aiAnswer: "",
      confidenceLevel: "low",
      confidenceScore: 0.2,
      generationMethod: "manual",
      reviewed: false,
      editedByFaculty: true,
      extractionSource: "manual",
    });
    await ctx.db.patch(args.assignmentId, { totalQuestions: questions.length + 1 });
    return questionId;
  },
});

export const deleteDraftQuestion = mutation({
  args: {
    questionId: v.id("questions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireLecturer(ctx);
    const question = await ctx.db.get(args.questionId);
    if (!question) {
      return null;
    }
    const assignment = await ctx.db.get(question.assignmentId);
    if (
      !assignment ||
      assignment.lecturerId !== userId ||
      assignment.organizationId !== organizationId
    ) {
      throw new Error("Access denied");
    }
    await ctx.db.delete(args.questionId);
    const remaining = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", question.assignmentId))
      .collect();
    for (let i = 0; i < remaining.length; i += 1) {
      const q = remaining[i];
      if (q.questionNumber !== i + 1) {
        await ctx.db.patch(q._id, { questionNumber: i + 1 });
      }
    }
    await ctx.db.patch(question.assignmentId, { totalQuestions: remaining.length });
    return null;
  },
});

export const publishDraftAssignment = mutation({
  args: {
    assignmentId: v.id("assignments"),
    acknowledgeUnreviewed: v.boolean(),
  },
  returns: v.object({
    published: v.boolean(),
    unreviewedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireLecturer(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (
      !assignment ||
      assignment.lecturerId !== userId ||
      assignment.organizationId !== organizationId
    ) {
      throw new Error("Assignment not found or access denied");
    }
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();
    if (questions.length === 0) {
      throw new Error("Cannot publish assignment with zero questions.");
    }
    const unreviewedCount = questions.filter((q) => !q.reviewed).length;
    if (unreviewedCount > 0 && !args.acknowledgeUnreviewed) {
      throw new Error(`There are ${unreviewedCount} unreviewed questions.`);
    }
    const publishedAt = Date.now();
    await ctx.db.patch(args.assignmentId, {
      isActive: true,
      publishedAt,
      totalQuestions: questions.length,
      aiProcessingStatus: "completed",
      aiProcessingError: undefined,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.notifications.sendAssignmentPublishedNotifications,
      {
        assignmentId: args.assignmentId,
        publishedAt,
      },
    );
    return { published: true, unreviewedCount };
  },
});

export const getJobByIdInternal = internalQuery({
  args: {
    jobId: v.id("facultyAssignmentJobs"),
    expectedOrganizationId: v.optional(v.id("organizations")),
  },
  returns: v.union(
    v.object({
      _id: v.id("facultyAssignmentJobs"),
      _creationTime: v.number(),
      organizationId: v.id("organizations"),
      assignmentId: v.id("assignments"),
      facultyId: v.id("users"),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("review_ready"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("failed_timeout"),
      ),
      inputType: v.union(v.literal("pdf"), v.literal("text")),
      sourceStorageId: v.optional(v.id("_storage")),
      sourceText: v.optional(v.string()),
      uploadRequestKey: v.optional(v.string()),
      sourceHash: v.optional(v.string()),
      sourceTitleNormalized: v.optional(v.string()),
      extractedText: v.optional(v.string()),
      processedQuestions: v.optional(v.number()),
      error: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return null;
    }
    if (args.expectedOrganizationId) {
      requireSameOrganization(job.organizationId, args.expectedOrganizationId);
    }
    return job;
  },
});

export const updateJobStatusInternal = internalMutation({
  args: {
    jobId: v.id("facultyAssignmentJobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("review_ready"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("failed_timeout"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const replaceQuestionsForDraftInternal = internalMutation({
  args: {
    assignmentId: v.id("assignments"),
    questions: v.array(
      v.object({
        questionNumber: v.number(),
        questionText: v.string(),
        contentBlocks: v.optional(v.array(contentBlockValidator)),
        questionType: v.string(),
        mcqOptions: v.optional(v.array(v.string())),
        correctOption: v.optional(mcqOptionValidator),
        subject: subjectValidator,
        topic: v.string(),
        difficulty: difficultyValidator,
        structuredRepresentation: v.optional(v.string()),
        correctAnswer: v.optional(v.string()),
        aiAnswer: v.optional(v.string()),
        confidenceLevel: confidenceLevelValidator,
        confidenceScore: v.number(),
        generationMethod: v.string(),
        reviewed: v.boolean(),
        editedByFaculty: v.boolean(),
        segmentationConfidence: v.number(),
        extractionSource: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("questions")
      .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
      .collect();
    for (const q of existing) {
      await ctx.db.delete(q._id);
    }
    for (const q of args.questions) {
      const blocks = q.contentBlocks ?? buildContentBlocksFromText(q.questionText);
      const validation = validateContentBlocks(blocks);
      if (!validation.valid) {
        throw new Error(`Question ${q.questionNumber}: ${validation.reason}`);
      }
      await ctx.db.insert("questions", {
        assignmentId: args.assignmentId,
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        contentBlocks: blocks,
        questionType: q.questionType,
        mcqOptions: q.mcqOptions,
        correctOption: q.correctOption,
        subject: q.subject,
        topic: q.topic,
        difficulty: q.difficulty,
        structuredRepresentation: q.structuredRepresentation,
        correctAnswer: q.correctAnswer,
        aiAnswer: q.aiAnswer,
        confidenceLevel: q.confidenceLevel,
        confidenceScore: q.confidenceScore,
        generationMethod: q.generationMethod,
        reviewed: q.reviewed,
        editedByFaculty: q.editedByFaculty,
        segmentationConfidence: q.segmentationConfidence,
        extractionSource: q.extractionSource,
      });
    }
    await ctx.db.patch(args.assignmentId, {
      totalQuestions: args.questions.length,
    });
    return null;
  },
});

export const completeJobInternal = internalMutation({
  args: {
    jobId: v.id("facultyAssignmentJobs"),
    extractedText: v.string(),
    processedQuestions: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "review_ready",
      extractedText: args.extractedText,
      processedQuestions: args.processedQuestions,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const failJobInternal = internalMutation({
  args: {
    jobId: v.id("facultyAssignmentJobs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const touchJobHeartbeatInternal = internalMutation({
  args: {
    jobId: v.id("facultyAssignmentJobs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const expireStaleProcessingJobsForFacultyInternal = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    facultyId: v.id("users"),
    timeoutMs: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("facultyAssignmentJobs")
      .withIndex("by_org_faculty_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("facultyId", args.facultyId).eq("status", "processing"),
      )
      .collect();
    const now = Date.now();
    let marked = 0;
    for (const job of jobs) {
      if (now - job.updatedAt <= args.timeoutMs) {
        continue;
      }
      await ctx.db.patch(job._id, {
        status: "failed_timeout",
        error: "Processing timed out. Please retry.",
        updatedAt: now,
      });
      await ctx.db.patch(job.assignmentId, {
        aiProcessingStatus: "failed_timeout",
        aiProcessingError: "Processing timed out. Please retry.",
      });
      marked += 1;
    }
    return marked;
  },
});

export const expireStaleProcessingJobsGlobal = internalMutation({
  args: {
    timeoutMs: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const thresholdMs = args.timeoutMs ?? JOB_TIMEOUT_MS;
    const jobs = await ctx.db.query("facultyAssignmentJobs").collect();
    const now = Date.now();
    let marked = 0;
    for (const job of jobs) {
      if (job.status !== "processing") {
        continue;
      }
      if (now - job.updatedAt <= thresholdMs) {
        continue;
      }
      await ctx.db.patch(job._id, {
        status: "failed_timeout",
        error: "Processing timed out. Please retry.",
        updatedAt: now,
      });
      await ctx.db.patch(job.assignmentId, {
        aiProcessingStatus: "failed_timeout",
        aiProcessingError: "Processing timed out. Please retry.",
      });
      marked += 1;
    }
    return marked;
  },
});

export const sweepMyStaleProcessingJobs = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const { userId, organizationId } = await requireLecturer(ctx);
    return await ctx.runMutation((internal as any).facultyAssignments.expireStaleProcessingJobsForFacultyInternal, {
      organizationId,
      facultyId: userId,
      timeoutMs: JOB_TIMEOUT_MS,
    });
  },
});

export const getLatestDraftJobs = query({
  args: {},
  returns: v.array(
    v.object({
      jobId: v.id("facultyAssignmentJobs"),
      assignmentId: v.id("assignments"),
      assignmentTitle: v.string(),
      inputType: v.union(v.literal("pdf"), v.literal("text")),
      isPublished: v.boolean(),
      status: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("review_ready"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("failed_timeout"),
      ),
      processedQuestions: v.optional(v.number()),
      error: v.optional(v.string()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { userId, organizationId } = await requireLecturer(ctx);
    const jobs = await ctx.db
      .query("facultyAssignmentJobs")
      .withIndex("by_org_faculty_created", (q) =>
        q.eq("organizationId", organizationId).eq("facultyId", userId),
      )
      .order("desc")
      .take(20);
    const rows: Array<{
      jobId: Id<"facultyAssignmentJobs">;
      assignmentId: Id<"assignments">;
      assignmentTitle: string;
      inputType: "pdf" | "text";
      isPublished: boolean;
      status: "pending" | "processing" | "review_ready" | "completed" | "failed" | "failed_timeout";
      processedQuestions?: number;
      error?: string;
      updatedAt: number;
    }> = [];
    for (const job of jobs) {
      const assignment = await ctx.db.get(job.assignmentId);
      if (!assignment || assignment.organizationId !== organizationId || assignment.lecturerId !== userId) {
        continue;
      }
      rows.push({
        jobId: job._id,
        assignmentId: job.assignmentId,
        assignmentTitle: assignment.title,
        inputType: job.inputType,
        isPublished: Boolean(assignment.publishedAt) || assignment.isActive,
        status: job.status,
        processedQuestions: job.processedQuestions,
        error: job.error,
        updatedAt: job.updatedAt,
      });
    }
    return rows;
  },
});

export const retryDraftJob = mutation({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    jobId: v.id("facultyAssignmentJobs"),
  }),
  handler: async (ctx, args) => {
    const { userId, organizationId } = await requireLecturer(ctx);
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment || assignment.organizationId !== organizationId || assignment.lecturerId !== userId) {
      throw new Error("Assignment not found or access denied.");
    }
    let job = assignment.aiJobId ? await ctx.db.get(assignment.aiJobId) : null;
    if (!job) {
      const jobs = await ctx.db
        .query("facultyAssignmentJobs")
        .withIndex("by_assignment", (q) => q.eq("assignmentId", args.assignmentId))
        .collect();
      job = jobs
        .filter((row) => row.organizationId === organizationId && row.facultyId === userId)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
    }
    if (!job) {
      throw new Error("No processing job found for this assignment.");
    }
    if (job.status !== "failed" && job.status !== "failed_timeout") {
      throw new Error("Retry is available only for failed jobs.");
    }
    if (job.inputType === "pdf" && !job.sourceStorageId) {
      throw new Error("Retry cannot continue because source PDF is missing. Please create a new upload.");
    }
    if (job.inputType === "text" && !job.sourceText) {
      throw new Error("Retry cannot continue because source text is missing. Please create a new upload.");
    }
    await ctx.db.patch(job._id, {
      status: "pending",
      error: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(args.assignmentId, {
      aiProcessingStatus: "processing",
      aiProcessingError: undefined,
    });
    await enqueueAiJob({
      organizationId: organizationId.toString(),
      scheduler: ctx.scheduler,
      delayMs: 0,
      fnRef: internal.facultyAssignments.processDraftJob,
      args: { jobId: job._id },
      fallback: async () => {
        await ctx.scheduler.runAfter(0, internal.facultyAssignments.processDraftJob, { jobId: job!._id });
      },
    });
    return { jobId: job._id };
  },
});

export const updateAssignmentAiStatusInternal = internalMutation({
  args: {
    assignmentId: v.id("assignments"),
    status: v.union(
      v.literal("processing"),
      v.literal("review_ready"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("failed_timeout"),
    ),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.assignmentId, {
      aiProcessingStatus: args.status,
      aiProcessingError: args.error,
    });
    return null;
  },
});

export const testGemini = action({
  args: {},
  returns: v.string(),
  handler: async () => {
    const text = await callGemini("gemini-2.5-pro", 'Say "HELLO" only.');
    console.log("[facultyAssignments] testGemini response", { text });
    return text;
  },
});
