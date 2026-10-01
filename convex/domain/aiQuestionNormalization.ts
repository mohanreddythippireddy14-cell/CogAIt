export type NormalizedAiQuestion = {
  question_text: string;
  question_type: "numerical" | "mcq" | "conceptual";
  subject: "Physics" | "Chemistry" | "Math";
  topic: string;
  difficulty_ai: "easy" | "medium" | "hard";
  structured_representation: {
    given_variables: string[];
    target_variable: string;
    equation_category: string;
    assumptions: string[];
  };
  ai_answer: string;
  confidence_level: "high" | "medium" | "low";
  confidence_score: number;
  segmentation_confidence: number;
  mcq_options?: string[];
  correct_option?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

function clampScore(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function normalizeQuestionType(value: unknown): NormalizedAiQuestion["question_type"] {
  const normalized = asString(value).toLowerCase();
  if (normalized === "mcq" || normalized.includes("multiple choice")) {
    return "mcq";
  }
  if (
    normalized === "numerical" ||
    normalized.includes("calculation") ||
    normalized.includes("problem solving")
  ) {
    return "numerical";
  }
  return "conceptual";
}

function normalizeSubject(value: unknown): NormalizedAiQuestion["subject"] {
  const normalized = asString(value).toLowerCase();
  if (normalized.includes("chem")) {
    return "Chemistry";
  }
  if (normalized.includes("math")) {
    return "Math";
  }
  return "Physics";
}

function normalizeDifficulty(value: unknown): NormalizedAiQuestion["difficulty_ai"] {
  const normalized = asString(value).toLowerCase();
  if (/hard|difficult|advanced|challenging|complex|expert/.test(normalized)) {
    return "hard";
  }
  if (/easy|basic|simple|beginner|introductory/.test(normalized)) {
    return "easy";
  }
  return "medium";
}

function normalizeConfidence(value: unknown): NormalizedAiQuestion["confidence_level"] {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high" || normalized.includes("strong")) {
    return "high";
  }
  if (normalized === "low" || normalized.includes("weak")) {
    return "low";
  }
  return "medium";
}

function repairInvalidJsonEscapes(text: string): string {
  let repaired = "";
  let inString = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      let precedingBackslashes = 0;
      for (let j = i - 1; j >= 0 && text[j] === "\\"; j -= 1) {
        precedingBackslashes += 1;
      }
      if (precedingBackslashes % 2 === 0) {
        inString = !inString;
      }
      repaired += char;
      continue;
    }

    if (inString && char === "\\") {
      const next = text[i + 1];
      if (next && !['"', "\\", "/", "b", "f", "n", "r", "t", "u"].includes(next)) {
        repaired += "\\\\";
        continue;
      }
    }
    repaired += char;
  }

  return repaired;
}

function extractJsonArray(text: string): string {
  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = withoutFence.indexOf("[");
  const end = withoutFence.lastIndexOf("]");
  return start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence;
}

export function parseAiQuestionResponse(text: string): unknown[] {
  const extracted = extractJsonArray(text);
  const candidates = [
    extracted,
    repairInvalidJsonEscapes(extracted),
    repairInvalidJsonEscapes(extracted).replace(/,\s*([}\]])/g, "$1"),
  ];
  let lastError: unknown;

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (isRecord(parsed)) {
        for (const key of ["questions", "items", "results", "data"]) {
          if (Array.isArray(parsed[key])) {
            return parsed[key];
          }
        }
      }
      throw new Error("AI response root must be an array or contain a questions array");
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Could not parse AI-generated questions as JSON: ${detail}`);
}

export function normalizeAiQuestion(value: unknown): NormalizedAiQuestion | null {
  if (typeof value === "string") {
    const questionText = value.trim();
    if (!questionText) {
      return null;
    }
    return {
      question_text: questionText,
      question_type: "conceptual",
      subject: "Physics",
      topic: "General",
      difficulty_ai: "medium",
      structured_representation: {
        given_variables: [],
        target_variable: "",
        equation_category: "",
        assumptions: [],
      },
      ai_answer: "",
      confidence_level: "low",
      confidence_score: 0.25,
      segmentation_confidence: 0.5,
    };
  }
  if (!isRecord(value)) {
    return null;
  }

  const questionText = asString(
    value.question_text ??
      value.questionText ??
      value.question ??
      value.text ??
      value.prompt ??
      value.stem,
  );
  if (!questionText) {
    return null;
  }

  const representation = isRecord(value.structured_representation)
    ? value.structured_representation
    : {};
  const questionType = normalizeQuestionType(value.question_type ?? value.questionType ?? value.type);
  const options = asStringArray(value.mcq_options ?? value.mcqOptions ?? value.options);
  const correctOption = asString(
    value.correct_option ?? value.correctOption ?? value.correct_choice,
  ).toUpperCase();

  return {
    question_text: questionText,
    question_type: questionType,
    subject: normalizeSubject(value.subject),
    topic: asString(value.topic, "General"),
    difficulty_ai: normalizeDifficulty(value.difficulty_ai ?? value.difficulty ?? value.level),
    structured_representation: {
      given_variables: asStringArray(representation.given_variables),
      target_variable: asString(representation.target_variable),
      equation_category: asString(representation.equation_category),
      assumptions: asStringArray(representation.assumptions),
    },
    ai_answer: asString(value.ai_answer ?? value.answer ?? value.correct_answer ?? value.solution),
    confidence_level: normalizeConfidence(value.confidence_level ?? value.confidence),
    confidence_score: clampScore(value.confidence_score, 0.5),
    segmentation_confidence: clampScore(value.segmentation_confidence, 0.5),
    mcq_options: questionType === "mcq" && options.length > 0 ? options : undefined,
    correct_option: questionType === "mcq" && /^[A-D]$/.test(correctOption) ? correctOption : undefined,
  };
}

export function normalizeAiQuestions(values: unknown[]): NormalizedAiQuestion[] {
  return values
    .map(normalizeAiQuestion)
    .filter((question): question is NormalizedAiQuestion => question !== null);
}
