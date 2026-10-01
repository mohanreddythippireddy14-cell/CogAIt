import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Groq from 'groq-sdk';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { documentAiOutputParser, topicTaxonomyMapper, jsonFormatter, convexWriteAssignment } from '../tools/agent5_tools.js';
import type { AssignmentCreatorInput, AssignmentCreatorOutput } from '../types/index.js';

const app = new Hono();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, baseURL: process.env.CONVEX_URL?.replace(".cloud", ".site") + "/api/gemini-proxy/" || "https://dynamic-alpaca-596.convex.site/api/gemini-proxy/" });
const MODELS = [(process.env.GEMINI_MODEL || 'gemini-3.8-flash')];

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.text('OK');
  await next();
});

const systemPrompt = `You are the onboarding specialist for CogAIt. You receive OCR-extracted text from Google Cloud Document AI. Your job is flawless conversion of lecturer content into CogAIt-compatible structured assignments.

You map every question to the CogAIt topic taxonomy. You never guess topic mapping — if confidence is below threshold, flag the item for manual lecturer review.
Your output must be valid JSON matching the CogAIt assignment schema exactly.

CRITICAL MATHEMATICAL FORMATTING RULES:
1. Format all mathematical equations, variables, and units using standard KaTeX/LaTeX notation.
2. Use inline math delimiters $...$ STRICTLY for math ONLY. DO NOT wrap normal English text inside $ delimiters.
3. BAD: $at 2 m/s^{2} for 10$ seconds.
4. GOOD: at $2 \\text{ m/s}^2$ for $10$ seconds.
5. Use proper integration symbols (\\int), fractions (\\frac), and exponents.

You MUST respond with ONLY valid JSON in this exact format:
{"assignment_id":"string","lecturer_id":"string","questions":[{"text":"string","options":["string"],"correct_answer":"string","mapped_topic":"string"}],"unmapped_items":[{"raw_text":"string","reason":"string"}],"mapping_confidence_avg":0.9}`;

app.post('/webhook/document_uploaded', async (c) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Agent5') as AssignmentCreatorInput;
    let lastErr: any;
    
    // Tools logic (Simulated execution)
    const parsedText = documentAiOutputParser(input.document_ai_extracted_text);
    // Note: topicTaxonomyMapper mapped inline during LLM output interpretation below
    
    for (const model of MODELS) {
      try {
        console.log(`[Agent5] Trying ${model}`);
        const result = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Lecturer: ${input.lecturer_id}\nDocument content:\n${parsedText || 'No text'}\nExtract and map all questions.` }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        });
        
        // Parse and validate
        let out = JSON.parse(result.choices[0]?.message?.content || '{}') as AssignmentCreatorOutput;
        out.lecturer_id = input.lecturer_id;
        out = jsonFormatter(out);
        out = await runPostExecutionHooks<AssignmentCreatorOutput>(out, 'Agent5', 'AssignmentCreatorOutput');
        
        // Finalize
        await convexWriteAssignment(out.lecturer_id, out);
        
        console.log(`[Agent5] Success with ${model}, extracted ${out.questions?.length || 0} questions`);
        return c.json({ success: true, assignment: out });
      } catch (e: any) { lastErr = e; console.warn(`[Agent5] ${model} failed: ${e.message?.slice(0,80)}`); }
    }
    throw lastErr;
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 8085;
console.log(`[agent5_ingestion] Starting on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
