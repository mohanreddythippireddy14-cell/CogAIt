const piiPatterns: RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:\+?\d{1,3}[-.\s]?)?(?:\d{10}|\d{3}[-.\s]\d{3}[-.\s]\d{4})\b/,
  /\b\d{12}\b/,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
];

export interface PiiDetectionResult {
  hasPii: boolean;
  matches: string[];
}

export const detectPiiDetailed = async (input: string): Promise<PiiDetectionResult> => {
  const matches = piiPatterns
    .flatMap((pattern) => input.match(pattern) ?? [])
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
