import { runPreExecutionHooks } from "./src/hooks/pre_hooks.js";
import dotenv from "dotenv";
dotenv.config();

// Ensure MOCK_LLM is unset
delete process.env.MOCK_LLM;

async function test() {
  try {
    const input = {
      student_id: "student123",
      problem_id: "p1",
      student_reasoning_input: "This is a valid reasoning that is at least 15 characters long.",
      current_scaffolding_depth: 0
    };
    console.log("Calling guardrail with Agent1...");
    const result = await runPreExecutionHooks(input, "Agent1");
    console.log("Success:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
  }
}
test();
