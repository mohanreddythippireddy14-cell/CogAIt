const piiPatterns: RegExp[] = [
  // Email address
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  // Phone: Indian mobile (starts 6-9) or a number written with a country code / separators
  /(?<![\d.])(?:\+\d{1,3}[-.\s]?\d{10}|\d{3}[-.\s]\d{3}[-.\s]\d{4}|[6-9]\d{9})(?![\d.])/g,
  // Aadhaar: 12 digits, optionally grouped 4-4-4, never starting with 0 or 1
  /(?<![\d.])[2-9]\d{3}[-\s]?\d{4}[-\s]?\d{4}(?![\d.])/g,
  // Payment card: 16 digits, optionally grouped
  /(?<![\d.])\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}(?![\d.])/g,
];

/**
 * Round quantities such as 3000000000 (m/s) or 600000000000 are common in physics and
 * chemistry answers; personal numbers practically never end in four zeros.
 */
function looksLikeQuantity(match: string): boolean {
  return /0000$/.test(match.replace(/[-.\s]/g, ''));
}

export interface PiiDetectionResult {
  hasPii: boolean;
  matches: string[];
}

export const detectPiiDetailed = async (input: string): Promise<PiiDetectionResult> => {
  const matches = piiPatterns
    .flatMap((pattern) => input.match(pattern) ?? [])
    .filter((value) => value.includes('@') || !looksLikeQuantity(value))
    .filter((value, index, all) => all.indexOf(value) === index);

  return {
    hasPii: matches.length > 0,
    matches,
  };
};

export const detectPii = async (input: string): Promise<boolean> => {
  const result = await detectPiiDetailed(input);
  return result.hasPii;
};
