import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";
import { contentBlockValidator, normalizeLegacyQuestionToBlocks } from "./domain/contentBlocks";

const questionWithMetadataValidator = v.object({
  _id: v.id("questions"),
  _creationTime: v.number(),
  assignmentId: v.id("assignments"),
  questionNumber: v.number(),
  questionText: v.string(),
  contentBlocks: v.optional(v.array(contentBlockValidator)),
  editedText: v.optional(v.string()),
  questionType: v.optional(v.string()),
  mcqOptions: v.optional(v.array(v.string())),
  correctOption: v.optional(
    v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("D")),
  ),
  subject: v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math")),
  topic: v.string(),
  difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
  givenVariables: v.optional(v.string()),
  correctAnswer: v.optional(v.string()),
  structuredRepresentation: v.optional(v.string()),
  aiAnswer: v.optional(v.string()),
  confidenceLevel: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
  confidenceScore: v.optional(v.number()),
  generationMethod: v.optional(v.string()),
  reviewed: v.optional(v.boolean()),
  reviewedAt: v.optional(v.number()),
  editedByFaculty: v.optional(v.boolean()),
  segmentationConfidence: v.optional(v.number()),
  extractionSource: v.optional(v.string()),
  imageId: v.optional(v.id("_storage")),
});

export const getQuestion = query({
  args: {
    questionId: v.id("questions"),
  },
  returns: v.object({
    _id: questionWithMetadataValidator.fields._id,
    _creationTime: questionWithMetadataValidator.fields._creationTime,
    assignmentId: questionWithMetadataValidator.fields.assignmentId,
    questionNumber: questionWithMetadataValidator.fields.questionNumber,
    questionText: questionWithMetadataValidator.fields.questionText,
    contentBlocks: questionWithMetadataValidator.fields.contentBlocks,
    editedText: questionWithMetadataValidator.fields.editedText,
    questionType: questionWithMetadataValidator.fields.questionType,
    mcqOptions: questionWithMetadataValidator.fields.mcqOptions,
    correctOption: questionWithMetadataValidator.fields.correctOption,
    subject: questionWithMetadataValidator.fields.subject,
    topic: questionWithMetadataValidator.fields.topic,
    difficulty: questionWithMetadataValidator.fields.difficulty,
    givenVariables: questionWithMetadataValidator.fields.givenVariables,
    correctAnswer: questionWithMetadataValidator.fields.correctAnswer,
    structuredRepresentation: questionWithMetadataValidator.fields.structuredRepresentation,
    aiAnswer: questionWithMetadataValidator.fields.aiAnswer,
    confidenceLevel: questionWithMetadataValidator.fields.confidenceLevel,
    confidenceScore: questionWithMetadataValidator.fields.confidenceScore,
    generationMethod: questionWithMetadataValidator.fields.generationMethod,
    reviewed: questionWithMetadataValidator.fields.reviewed,
    reviewedAt: questionWithMetadataValidator.fields.reviewedAt,
    editedByFaculty: questionWithMetadataValidator.fields.editedByFaculty,
    segmentationConfidence: questionWithMetadataValidator.fields.segmentationConfidence,
    extractionSource: questionWithMetadataValidator.fields.extractionSource,
    imageId: questionWithMetadataValidator.fields.imageId,
    imageUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const { profile } = await requireAuthWithProfile(ctx);

    const question = await ctx.db.get(args.questionId);
    if (!question) {
      throw new Error("Question not found");
    }
    const assignment = await ctx.db.get(question.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found");
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);

    // Get image URL if exists
    let imageUrl = null;
    if (question.imageId) {
      imageUrl = await ctx.storage.getUrl(question.imageId);
    }

    return {
      ...question,
      contentBlocks: question.contentBlocks ?? normalizeLegacyQuestionToBlocks(question.questionText ?? ""),
      imageUrl,
    };
  },
});

export const getById = query({
  args: {
    questionId: v.id("questions"),
  },
  returns: v.union(
    questionWithMetadataValidator,
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { profile } = await requireAuthWithProfile(ctx);
    const question = await ctx.db.get(args.questionId);
    if (!question) {
      return null;
    }
    const assignment = await ctx.db.get(question.assignmentId);
    if (!assignment) {
      return null;
    }
    requireSameOrganization(assignment.organizationId, profile.organizationId);
    return {
      ...question,
      contentBlocks: question.contentBlocks ?? normalizeLegacyQuestionToBlocks(question.questionText ?? ""),
    };
  },
});
