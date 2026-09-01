import { GoogleGenerativeAI } from "@google/generative-ai";

export type GeminiTextRequest = {
  prompt: string;
  candidateModels: string[];
  temperature: number;
  maxOutputTokens: number;
  timeoutMs?: number;
  retryQuotaOnce?: boolean;
  onUsage?: (usage: { model: string; totalTokenCount: number }) => void;
};

export type GeminiMultimodalRequest = {
  promptParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  candidateModels: string[];
  temperature: number;
  maxOutputTokens: number;
  timeoutMs?: number;
  retryQuotaOnce?: boolean;
  onUsage?: (usage: { model: string; totalTokenCount: number }) => void;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        if (timer) clearTimeout(timer);
        reject(error);
      });
  });
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("too many requests") ||
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("deadline") ||
    msg.includes("503") ||
    msg.includes("unavailable")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getClient() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }
  return new GoogleGenerativeAI(apiKey);
}

export async function generateTextWithFallback(req: GeminiTextRequest): Promise<{
  text: string;
  totalTokenCount: number;
  model: string;
}> {
  const genAI = getClient();
  const timeoutMs = req.timeoutMs ?? 60000;
  let lastError: unknown = null;

  for (const modelName of req.candidateModels) {
    const attempt = async () => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: req.prompt }] }],
        generationConfig: {
          temperature: req.temperature,
          maxOutputTokens: req.maxOutputTokens,
        },
      } as any);
      const response = await result.response;
      const text = response.text();
      if (!text) {
        throw new Error("Gemini response did not include message content");
      }
      const totalTokenCount = response.usageMetadata?.totalTokenCount ?? 0;
      req.onUsage?.({ model: modelName, totalTokenCount });
      return { text, totalTokenCount, model: modelName };
    };

    try {
      return await withTimeout(attempt(), timeoutMs, `Gemini ${modelName}`);
    } catch (error) {
      lastError = error;
      if (req.retryQuotaOnce && isRetryableError(error)) {
        await sleep(3000);
        try {
          return await withTimeout(attempt(), timeoutMs, `Gemini ${modelName} retry`);
        } catch (retryError) {
          lastError = retryError;
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All Gemini models failed.");
}

export async function generateMultimodalWithFallback(req: GeminiMultimodalRequest): Promise<{
  text: string;
  totalTokenCount: number;
  model: string;
}> {
  const genAI = getClient();
  const timeoutMs = req.timeoutMs ?? 60000;
  let lastError: unknown = null;

  for (const modelName of req.candidateModels) {
    const attempt = async () => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: req.promptParts }],
        generationConfig: {
          temperature: req.temperature,
          maxOutputTokens: req.maxOutputTokens,
        },
      } as any);
      const response = await result.response;
      const text = response.text();
      if (!text) {
        throw new Error("Gemini response did not include message content");
      }
      const totalTokenCount = response.usageMetadata?.totalTokenCount ?? 0;
      req.onUsage?.({ model: modelName, totalTokenCount });
      return { text, totalTokenCount, model: modelName };
    };

    try {
      return await withTimeout(attempt(), timeoutMs, `Gemini ${modelName}`);
    } catch (error) {
      lastError = error;
      if (req.retryQuotaOnce && isRetryableError(error)) {
        await sleep(3000);
        try {
          return await withTimeout(attempt(), timeoutMs, `Gemini ${modelName} retry`);
        } catch (retryError) {
          lastError = retryError;
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("All Gemini models failed.");
}
