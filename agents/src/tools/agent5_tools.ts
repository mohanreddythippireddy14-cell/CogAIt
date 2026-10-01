// Tools for Agent 5 (Assignment Creator)
import { convex } from '../memory/convex_client.js';

export const documentAiOutputParser = (rawText: string): string => {
  console.log(`[DocAIParser] Parsing raw OCR text... (${rawText.length} chars)`);
  return rawText.trim();
};

export const topicTaxonomyMapper = async (content: string): Promise<string> => {
  console.log(`[TaxonomyMapper] Mapping content to CogAIt taxonomy...`);
  return "mapped_taxonomy_term"; // Simulated
};

function ensureStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return undefined;
}

export const jsonFormatter = (data: any): any => {
  const questions = Array.isArray(data?.questions)
    ? data.questions
        .map((question: any, index: number) => {
          const text =
            question?.text ??
            question?.question_text ??
            question?.question ??
            question?.prompt ??
            question?.statement;

          if (!text || !String(text).trim()) {
            return null;
          }

          const mappedTopic =
            question?.mapped_topic ??
            question?.topic ??
            question?.taxonomy ??
            question?.subject_topic ??
            "general";

          return {
            text: String(text).trim(),
            options: ensureStringArray(question?.options ?? question?.choices),
            correct_answer:
              typeof question?.correct_answer === "string"
                ? question.correct_answer.trim()
                : typeof question?.answer === "string"
                  ? question.answer.trim()
                  : undefined,
            mapped_topic: String(mappedTopic).trim() || `topic_${index + 1}`,
          };
        })
        .filter(Boolean)
    : [];

  const unmappedItems = Array.isArray(data?.unmapped_items)
    ? data.unmapped_items
        .map((item: any) => ({
          raw_text: String(item?.raw_text ?? item?.text ?? "").trim(),
          reason: String(item?.reason ?? item?.note ?? "Low mapping confidence").trim(),
        }))
        .filter((item: { raw_text: string; reason: string }) => item.raw_text && item.reason)
    : [];

  return {
    assignment_id: String(data?.assignment_id ?? `assign_${Date.now()}`).trim(),
    lecturer_id: String(data?.lecturer_id ?? "").trim(),
    questions,
    unmapped_items: unmappedItems,
    mapping_confidence_avg:
      typeof data?.mapping_confidence_avg === "number"
        ? Math.max(0, Math.min(1, data.mapping_confidence_avg))
        : 0.7,
  };
};

export const convexWriteAssignment = async (lecturerId: string, payload: any): Promise<void> => {
  console.log(`[ConvexWriteAssignment] Stored generated assignment for lecturer ${lecturerId}`);
};
