// Tools for Agent 5 (Assignment Creator)
import { createDraftAssignment } from '../memory/convex_client.js';
import type { AssignmentCreatorInput, AssignmentCreatorOutput, Subject } from '../types/index.js';

const SUBJECTS: Subject[] = ['Physics', 'Chemistry', 'Math'];

/** Maps free-text subject names to the schema's subject values. */
export function normalizeSubject(value: unknown): Subject | undefined {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return undefined;
  if (text.startsWith('phys')) return 'Physics';
  if (text.startsWith('chem')) return 'Chemistry';
  if (text.startsWith('math')) return 'Math';
  return SUBJECTS.find((subject) => subject.toLowerCase() === text);
}

export const documentAiOutputParser = (rawText: string): string => {
  console.log(`[DocAIParser] Parsing raw OCR text... (${rawText.length} chars)`);
  return rawText.trim();
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
            subject: normalizeSubject(question?.subject),
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

/** Stores the questions as an unpublished draft assignment; returns its Convex id. */
export const convexWriteAssignment = async (
  input: AssignmentCreatorInput,
  output: AssignmentCreatorOutput,
): Promise<string> => {
  return createDraftAssignment({
    lecturerId: input.lecturer_id,
    title: input.source_filename.replace(/\.[a-z0-9]+$/i, ''),
    defaultSubject: input.subject ?? 'Physics',
    questions: output.questions.map((question) => ({
      text: question.text,
      options: question.options,
      correctAnswer: question.correct_answer,
      topic: question.mapped_topic,
      subject: question.subject,
    })),
  });
};
