import { v } from "convex/values";

export const EQUATION_SOURCES = ["unicode-converted", "direct-latex", "needsReview"] as const;
export type EquationSource = (typeof EQUATION_SOURCES)[number];

export type TextContentBlock = {
  type: "text";
  value: string;
};

export type EquationContentBlock = {
  type: "equation";
  value: string;
  source: EquationSource;
  needsReview?: boolean;
};

export type ContentBlock = TextContentBlock | EquationContentBlock;

export const equationContentBlockValidator = v.object({
  type: v.literal("equation"),
  value: v.string(),
  source: v.union(
    v.literal("unicode-converted"),
    v.literal("direct-latex"),
    v.literal("needsReview"),
  ),
  needsReview: v.optional(v.boolean()),
});

export const contentBlockValidator = v.union(
  v.object({
    type: v.literal("text"),
    value: v.string(),
  }),
  equationContentBlockValidator,
);

const UNICODE_OPERATOR_REGEX = /[=+\-*/^<>]/;
const UNICODE_MATH_SYMBOL_REGEX = /[\u00D7\u00F7\u03C0\u03A0\u2202\u2211\u221A\u222B\u2260\u2264\u2265]/;
const UNICODE_SUPERSUB_REGEX = /[\u00B2\u00B3\u00B9\u2070-\u207F\u2080-\u209F]/;
const LATEX_COMMAND_REGEX = /\\[a-zA-Z]+/;
const SIMPLE_WORD_REGEX = /^[A-Za-z]{1,3}$/;

const SUPERSCRIPT_MAP: Record<string, string> = {
  "\u00B9": "1",
  "\u00B2": "2",
  "\u00B3": "3",
  "\u2070": "0",
  "\u2074": "4",
  "\u2075": "5",
  "\u2076": "6",
  "\u2077": "7",
  "\u2078": "8",
  "\u2079": "9",
  "\u207A": "+",
  "\u207B": "-",
  "\u207C": "=",
  "\u207D": "(",
  "\u207E": ")",
  "\u207F": "n",
};

const SUBSCRIPT_MAP: Record<string, string> = {
  "\u2080": "0",
  "\u2081": "1",
  "\u2082": "2",
  "\u2083": "3",
  "\u2084": "4",
  "\u2085": "5",
  "\u2086": "6",
  "\u2087": "7",
  "\u2088": "8",
  "\u2089": "9",
  "\u208A": "+",
  "\u208B": "-",
  "\u208C": "=",
  "\u208D": "(",
  "\u208E": ")",
};

const SYMBOL_TO_LATEX: Record<string, string> = {
  "\u2211": "\\sum",
  "\u222B": "\\int",
  "\u221A": "\\sqrt",
  "\u03C0": "\\pi",
  "\u03A0": "\\Pi",
  "\u2202": "\\partial",
  "\u2264": "\\le",
  "\u2265": "\\ge",
  "\u2260": "\\ne",
  "\u00D7": "\\times",
  "\u00F7": "\\div",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function countMathOperators(value: string): number {
  return (value.match(/[=+\-*/^<>\u00D7\u00F7]/g) ?? []).length;
}

function hasStrongMathSignal(value: string): boolean {
  if (UNICODE_MATH_SYMBOL_REGEX.test(value)) {
    return true;
  }
  if (UNICODE_SUPERSUB_REGEX.test(value)) {
    return true;
  }
  if (LATEX_COMMAND_REGEX.test(value)) {
    return true;
  }
  const compact = value.replace(/\s+/g, "");
  if (!compact) {
    return false;
  }
  const density = countMathOperators(value) / compact.length;
  return density >= 0.14;
}

function looksLikeDirectLatex(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return LATEX_COMMAND_REGEX.test(trimmed) || /[_^{}]/.test(trimmed);
}

function isTokenMathLike(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    return false;
  }
  if (looksLikeDirectLatex(trimmed)) {
    return true;
  }
  if (UNICODE_MATH_SYMBOL_REGEX.test(trimmed) || UNICODE_SUPERSUB_REGEX.test(trimmed)) {
    return true;
  }
  if (UNICODE_OPERATOR_REGEX.test(trimmed)) {
    return true;
  }
  if (/^\d+([.,]\d+)?$/.test(trimmed)) {
    return true;
  }
  return SIMPLE_WORD_REGEX.test(trimmed);
}

function unicodeMathToLatex(input: string): string {
  let out = "";
  const value = input.trim();
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (SUPERSCRIPT_MAP[ch]) {
      let run = "";
      while (i < value.length && SUPERSCRIPT_MAP[value[i]]) {
        run += SUPERSCRIPT_MAP[value[i]];
        i += 1;
      }
      i -= 1;
      out += `^{${run}}`;
      continue;
    }
    if (SUBSCRIPT_MAP[ch]) {
      let run = "";
      while (i < value.length && SUBSCRIPT_MAP[value[i]]) {
        run += SUBSCRIPT_MAP[value[i]];
        i += 1;
      }
      i -= 1;
      out += `_{${run}}`;
      continue;
    }
    out += SYMBOL_TO_LATEX[ch] ?? ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

export function isStructurallyValidLatex(value: string): boolean {
  const latex = value.trim();
  if (!latex) {
    return false;
  }
  let depth = 0;
  for (let i = 0; i < latex.length; i += 1) {
    const ch = latex[i];
    const prev = i > 0 ? latex[i - 1] : "";
    if (ch === "{" && prev !== "\\") {
      depth += 1;
    } else if (ch === "}" && prev !== "\\") {
      depth -= 1;
      if (depth < 0) {
        return false;
      }
    }
  }
  if (depth !== 0) {
    return false;
  }
  if (/\\\s/.test(latex) || /\\$/.test(latex)) {
    return false;
  }
  return true;
}

function splitInlineMathSegments(line: string): ContentBlock[] {
  const trimmed = normalizeWhitespace(line);
  if (!trimmed) {
    return [];
  }
  if (!hasStrongMathSignal(trimmed)) {
    return [{ type: "text", value: trimmed }];
  }

  const tokens = trimmed.split(/\s+/);
  const blocks: ContentBlock[] = [];
  let cursor = 0;
  while (cursor < tokens.length) {
    if (!isTokenMathLike(tokens[cursor])) {
      const textTokens: string[] = [];
      while (cursor < tokens.length && !isTokenMathLike(tokens[cursor])) {
        textTokens.push(tokens[cursor]);
        cursor += 1;
      }
      const text = textTokens.join(" ").trim();
      if (text) {
        blocks.push({ type: "text", value: text });
      }
      continue;
    }

    const equationTokens: string[] = [];
    let runHasStrongSignal = false;
    while (cursor < tokens.length && isTokenMathLike(tokens[cursor])) {
      const token = tokens[cursor];
      equationTokens.push(token);
      if (hasStrongMathSignal(token)) {
        runHasStrongSignal = true;
      }
      cursor += 1;
    }
    const runText = equationTokens.join(" ").trim();
    if (!runText) {
      continue;
    }
    if (!runHasStrongSignal) {
      blocks.push({ type: "text", value: runText });
      continue;
    }

    if (looksLikeDirectLatex(runText)) {
      const equation: EquationContentBlock = {
        type: "equation",
        value: runText,
        source: "direct-latex",
      };
      if (!isStructurallyValidLatex(equation.value)) {
        equation.source = "needsReview";
        equation.needsReview = true;
      }
      blocks.push(equation);
      continue;
    }

    const latex = unicodeMathToLatex(runText);
    if (isStructurallyValidLatex(latex)) {
      blocks.push({
        type: "equation",
        value: latex,
        source: "unicode-converted",
      });
    } else {
      blocks.push({
        type: "equation",
        value: runText,
        source: "needsReview",
        needsReview: true,
      });
    }
  }

  return compressAdjacentTextBlocks(blocks);
}

export function buildContentBlocksFromText(text: string): ContentBlock[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }
  const lines = normalized.split(/\n+/).flatMap((line) => {
    const blocks: ContentBlock[] = [];
    const markerRegex = /\[EQ:([\s\S]*?)\]/g;
    let lastIndex = 0;
    let match = markerRegex.exec(line);
    while (match) {
      const [full, equationValue] = match;
      const before = line.slice(lastIndex, match.index);
      blocks.push(...splitInlineMathSegments(before));
      const rawLatex = equationValue.trim();
      if (rawLatex) {
        if (isStructurallyValidLatex(rawLatex)) {
          blocks.push({
            type: "equation",
            value: rawLatex,
            source: "direct-latex",
          });
        } else {
          blocks.push({
            type: "equation",
            value: rawLatex,
            source: "needsReview",
            needsReview: true,
          });
        }
      }
      lastIndex = match.index + full.length;
      match = markerRegex.exec(line);
    }
    blocks.push(...splitInlineMathSegments(line.slice(lastIndex)));
    return blocks;
  });
  return compressAdjacentTextBlocks(lines);
}

export function compressAdjacentTextBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (!block.value || !block.value.trim()) {
      continue;
    }
    if (block.type === "text") {
      const textValue = block.value.trim();
      const last = out[out.length - 1];
      if (last && last.type === "text") {
        last.value = `${last.value} ${textValue}`.trim();
      } else {
        out.push({ type: "text", value: textValue });
      }
      continue;
    }
    out.push({
      type: "equation",
      value: block.value.trim(),
      source: block.source,
      needsReview: block.needsReview,
    });
  }
  return out;
}

export function blocksToLegacyText(blocks: ContentBlock[]): string {
  return blocks.map((block) => {
    if (block.type === "text") {
      return block.value.trim();
    }
    return `$${block.value.trim()}$`;
  }).filter(Boolean).join(" ").trim();
}

export function normalizeLegacyQuestionToBlocks(questionText: string): ContentBlock[] {
  const blocks = buildContentBlocksFromText(questionText);
  if (blocks.length > 0) {
    return blocks;
  }
  const trimmed = questionText.trim();
  return trimmed ? [{ type: "text", value: trimmed }] : [];
}

export function validateContentBlocks(
  blocks: ContentBlock[] | undefined,
): { valid: true } | { valid: false; reason: string } {
  if (!blocks) {
    return { valid: true };
  }
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return { valid: false, reason: "contentBlocks must contain at least one block." };
  }
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!block || !block.type || !block.value || !block.value.trim()) {
      return { valid: false, reason: `Block ${i + 1} is empty or malformed.` };
    }
    if (block.type === "equation") {
      if (!block.source) {
        return { valid: false, reason: `Equation block ${i + 1} must include source.` };
      }
      if (block.source !== "needsReview" && !isStructurallyValidLatex(block.value)) {
        return { valid: false, reason: `Equation block ${i + 1} has invalid LaTeX syntax.` };
      }
    }
  }
  return { valid: true };
}

export function toAiStructuredLines(blocks: ContentBlock[]): string[] {
  const compact = compressAdjacentTextBlocks(blocks);
  return compact.map((block) => {
    if (block.type === "text") {
      return `Text: ${block.value}`;
    }
    return `Equation: ${block.value}`;
  });
}

export function computeBlockMetrics(blocks: ContentBlock[]): {
  totalBlocks: number;
  equationBlocks: number;
  needsReviewBlocks: number;
} {
  let equationBlocks = 0;
  let needsReviewBlocks = 0;
  for (const block of blocks) {
    if (block.type === "equation") {
      equationBlocks += 1;
      if (block.needsReview || block.source === "needsReview") {
        needsReviewBlocks += 1;
      }
    }
  }
  return {
    totalBlocks: blocks.length,
    equationBlocks,
    needsReviewBlocks,
  };
}
