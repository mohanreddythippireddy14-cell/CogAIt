function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asString(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}
function asStringArray(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
        : [];
}
function clampScore(value, fallback) {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}
function normalizeQuestionType(value) {
    const normalized = asString(value).toLowerCase();
    if (normalized === "mcq" || normalized.includes("multiple choice")) {
        return "mcq";
    }
    if (normalized === "numerical" ||
        normalized.includes("calculation") ||
        normalized.includes("problem solving")) {
        return "numerical";
    }
    return "conceptual";
}
function normalizeSubject(value) {
    const normalized = asString(value).toLowerCase();
    if (normalized.includes("chem")) {
        return "Chemistry";
    }
    if (normalized.includes("math")) {
        return "Math";
    }
    return "Physics";
}
function normalizeDifficulty(value) {
    const normalized = asString(value).toLowerCase();
    if (/hard|difficult|advanced|challenging|complex|expert/.test(normalized)) {
        return "hard";
    }
    if (/easy|basic|simple|beginner|introductory/.test(normalized)) {
        return "easy";
    }
    return "medium";
}
function normalizeConfidence(value) {
    const normalized = asString(value).toLowerCase();
    if (normalized === "high" || normalized.includes("strong")) {
        return "high";
    }
    if (normalized === "low" || normalized.includes("weak")) {
        return "low";
    }
    return "medium";
}
function repairInvalidJsonEscapes(text) {
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
function extractJsonArray(text) {
    const withoutFence = text
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
    const start = withoutFence.indexOf("[");
    const end = withoutFence.lastIndexOf("]");
    return start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence;
}
export function parseAiQuestionResponse(text) {
    const extracted = extractJsonArray(text);
    const candidates = [
        extracted,
        repairInvalidJsonEscapes(extracted),
        repairInvalidJsonEscapes(extracted).replace(/,\s*([}\]])/g, "$1"),
    ];
    let lastError;
    for (const candidate of [...new Set(candidates)]) {
        try {
            const parsed = JSON.parse(candidate);
            if (!Array.isArray(parsed)) {
                throw new Error("AI response root must be an array");
            }
            return parsed;
        }
        catch (error) {
            lastError = error;
        }
    }
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Could not parse AI-generated questions as JSON: ${detail}`);
}
export function normalizeAiQuestion(value) {
    if (!isRecord(value)) {
        return null;
    }
    const questionText = asString(value.question_text ?? value.questionText);
    if (!questionText) {
        return null;
    }
    const representation = isRecord(value.structured_representation)
        ? value.structured_representation
        : {};
    const questionType = normalizeQuestionType(value.question_type ?? value.questionType);
    const options = asStringArray(value.mcq_options ?? value.mcqOptions);
    const correctOption = asString(value.correct_option ?? value.correctOption).toUpperCase();
    return {
        question_text: questionText,
        question_type: questionType,
        subject: normalizeSubject(value.subject),
        topic: asString(value.topic, "General"),
        difficulty_ai: normalizeDifficulty(value.difficulty_ai ?? value.difficulty),
        structured_representation: {
            given_variables: asStringArray(representation.given_variables),
            target_variable: asString(representation.target_variable),
            equation_category: asString(representation.equation_category),
            assumptions: asStringArray(representation.assumptions),
        },
        ai_answer: asString(value.ai_answer ?? value.answer),
        confidence_level: normalizeConfidence(value.confidence_level),
        confidence_score: clampScore(value.confidence_score, 0.5),
        segmentation_confidence: clampScore(value.segmentation_confidence, 0.5),
        mcq_options: questionType === "mcq" && options.length > 0 ? options : undefined,
        correct_option: questionType === "mcq" && /^[A-D]$/.test(correctOption) ? correctOption : undefined,
    };
}
export function normalizeAiQuestions(values) {
    return values
        .map(normalizeAiQuestion)
        .filter((question) => question !== null);
}
