import { validateSchema } from '../guardrails/schema_validator.js';
import Groq from 'groq-sdk';

export const runPostExecutionHooks = async <T>(output: any, agentId: string, schemaName: string): Promise<T> => {
  // 1. Output schema validation 
  let validated: T;
  try {
    validated = validateSchema<T>(output, schemaName);
  } catch (err) {
    throw new Error(`[PostHook - ${agentId}] Schema validation failed.`);
  }

  // 2. LLM as a Judge Guardrail (e.g. Socratic constraints)
  if (process.env.GROQ_API_KEY && (agentId === 'agent1_socratic' || agentId === 'Agent1_Socratic')) {
    try {
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const evaluation = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
          { 
            role: 'system', 
            content: `You are an output safety Judge. For a Socratic tutor, giving direct final mathematics/physics answers is strictly forbidden. 
Evaluate if the AI's response gave the direct final numerical or conceptual answer away instead of a hint.
Respond ONLY with valid JSON: {"passed": boolean, "violation": "string"}. 
"passed": true means the output is safe and did NOT give the direct answer.` 
          },
          { role: 'user', content: `AI Response to evaluate: ${outputStr}` }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });
      const result = JSON.parse(evaluation.choices[0]?.message?.content || '{"passed":true}');
      if (!result.passed) {
        console.error(`🚨 [Guardrail Violation Caught] ${result.violation}`);
        throw new Error(`[PolicyException] The agent attempted to give a direct answer: ${result.violation}`);
      }
    } catch(err: any) {
      if (err.message.includes('[PolicyException]')) throw err;
      console.warn(`[PostHook LLM Warning] ${err.message}`);
    }
  }

  return validated;
};
