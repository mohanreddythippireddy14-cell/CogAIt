type RawAiQuestion = {
  question_text?: unknown;
  question_type?: unknown;
  subject?: unknown;
  topic?: unknown;
  difficulty_ai?: unknown;
  structured_representation?: unknown;
  ai_answer?: unknown;
  confidence_level?: unknown;
  confidence_score?: unknown;
  segmentation_confidence?: unknown;
};

const QUESTION_TYPES = new Set(["numerical", "mcq", "conceptual"]);
const SUBJECTS = new Set(["Physics", "Chemistry", "Math"]);
const DIFFICULTY = new Set(["easy", "medium", "hard"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateStrictAiQuestions(input: unknown): { valid: boolean; errors: string[] } {
  if (!Array.isArray(input)) {
    return { valid: false, errors: ["Root response must be an array"] };
  }

  const errors: string[] = [];
  for (let i = 0; i < input.length; i += 1) {
    const q = input[i] as RawAiQuestion;
    if (!isObject(q)) {
      errors.push(`questions[${i}] must be an object`);
      continue;
    }
    if (typeof q.question_text !== "string" || q.question_text.trim().length === 0) {
      errors.push(`questions[${i}].question_text is invalid`);
    }
    if (!QUESTION_TYPES.has(String(q.question_type))) {
      errors.push(`questions[${i}].question_type is invalid`);
    }
    if (!SUBJECTS.has(String(q.subject))) {
      errors.push(`questions[${i}].subject is invalid`);
    }
    if (typeof q.topic !== "string" || q.topic.trim().length === 0) {
      errors.push(`questions[${i}].topic is invalid`);
    }
    if (!DIFFICULTY.has(String(q.difficulty_ai))) {
      errors.push(`questions[${i}].difficulty_ai is invalid`);
    }
    if (typeof q.ai_answer !== "string") {
      errors.push(`questions[${i}].ai_answer is invalid`);
    }
    if (!CONFIDENCE.has(String(q.confidence_level))) {
      errors.push(`questions[${i}].confidence_level is invalid`);
    }
    if (typeof q.confidence_score !== "number" || Number.isNaN(q.confidence_score)) {
      errors.push(`questions[${i}].confidence_score is invalid`);
    }
    if (
      typeof q.segmentation_confidence !== "number" ||
      Number.isNaN(q.segmentation_confidence)
    ) {
      errors.push(`questions[${i}].segmentation_confidence is invalid`);
    }
    if (!isObject(q.structured_representation)) {
      errors.push(`questions[${i}].structured_representation must be an object`);
    }
  }

  return { valid: errors.length === 0, errors };
}
