import { assert } from "./assert.js";
import { normalizeAiQuestions, parseAiQuestionResponse, } from "../convex/domain/aiQuestionNormalization.js";
export async function runAiQuestionValidation() {
    const malformed = String.raw `Here is the JSON:
[
  {
    "question_text": "Evaluate [EQ:\int_0^1 x^2 dx]",
    "question_type": "calculation",
    "subject": "math",
    "topic": "Integration",
    "difficulty_ai": "conceptual",
    "structured_representation": {},
    "ai_answer": "1/3",
    "confidence_level": "strong",
    "confidence_score": 2,
    "segmentation_confidence": "0.8",
  }
]`;
    const normalized = normalizeAiQuestions(parseAiQuestionResponse(malformed));
    assert(normalized.length === 1, "malformed Gemini JSON should be repaired");
    assert(normalized[0].question_text.includes(String.raw `\int`), "equation backslashes must be preserved");
    assert(normalized[0].question_type === "numerical", "calculation must normalize to numerical");
    assert(normalized[0].subject === "Math", "subject casing must normalize");
    assert(normalized[0].difficulty_ai === "medium", "conceptual difficulty must normalize to medium");
    assert(normalized[0].confidence_level === "high", "confidence aliases must normalize");
    assert(normalized[0].confidence_score === 1, "confidence scores must be clamped");
    const wrapped = parseAiQuestionResponse(JSON.stringify({
        questions: [
            {
                question: "Explain Newton's second law.",
                type: "conceptual",
                subject: "physics",
                difficulty: "beginner",
                answer: "Force equals mass times acceleration.",
            },
        ],
    }));
    const normalizedWrapped = normalizeAiQuestions(wrapped);
    assert(normalizedWrapped.length === 1, "wrapped question arrays must be accepted");
    assert(normalizedWrapped[0].difficulty_ai === "easy", "difficulty aliases must normalize");
    assert(normalizedWrapped[0].ai_answer.length > 0, "answer aliases must normalize");
    const stringQuestions = normalizeAiQuestions(["What is photosynthesis?"]);
    assert(stringQuestions.length === 1, "plain string questions must be accepted");
}
