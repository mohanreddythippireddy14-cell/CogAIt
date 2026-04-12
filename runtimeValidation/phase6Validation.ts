import fs from "node:fs";
import path from "node:path";
import { assert } from "./assert.js";
import {
  getFeatureFlagSnapshot,
  resetAllFeatureFlags,
  setOrganizationFeatureFlag,
  isFeatureEnabled,
  clearOrganizationFeatureFlag,
} from "../convex/infrastructure/featureFlags.js";
import { validateStrictAiQuestions } from "../convex/domain/strictJsonValidation.js";
import { shouldBlockForRegression } from "../convex/domain/aiRegression.js";

function read(file: string) {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}

export async function runPhase6Validation() {
  resetAllFeatureFlags();
  const defaults = getFeatureFlagSnapshot("org_phase6");
  assert(defaults.strictJsonValidation === false, "strictJsonValidation must default to false");
  assert(defaults.promptVersioning === false, "promptVersioning must default to false");
  assert(defaults.aiRegressionEnforcement === false, "aiRegressionEnforcement must default to false");

  const valid = validateStrictAiQuestions([{
    question_text: "Q1",
    question_type: "mcq",
    subject: "Physics",
    topic: "Kinematics",
    difficulty_ai: "easy",
    structured_representation: {},
    ai_answer: "A",
    confidence_level: "high",
    confidence_score: 0.9,
    segmentation_confidence: 0.8,
  }]);
  assert(valid.valid, "strict JSON validator should accept valid payload");
  const invalid = validateStrictAiQuestions([{ question_text: "" }]);
  assert(!invalid.valid, "strict JSON validator should reject invalid payload");

  assert(!shouldBlockForRegression({ aiRegressionEnforcementEnabled: false, validationValid: false }), "regression block must be disabled when flag off");
  assert(shouldBlockForRegression({ aiRegressionEnforcementEnabled: true, validationValid: false }), "regression block must trigger when flag on and invalid");

  const aiSource = read("convex/ai.ts");
  assert(aiSource.includes("logPromptVersionEvent"), "AI module must log prompt versions");
  assert(aiSource.includes("shouldBlockForRegression"), "AI module must enforce regression policy");
  const facultySource = read("convex/facultyAssignments.ts");
  assert(facultySource.includes("validateStrictAiQuestions"), "Faculty draft processing must use strict JSON validator");
  const schema = read("convex/schema.ts");
  assert(schema.includes("promptVersionEvents: defineTable"), "promptVersionEvents table must exist");

  setOrganizationFeatureFlag("org_phase6", "strictJsonValidation", true);
  setOrganizationFeatureFlag("org_phase6", "promptVersioning", true);
  setOrganizationFeatureFlag("org_phase6", "aiRegressionEnforcement", true);
  assert(isFeatureEnabled("strictJsonValidation", "org_phase6"), "strictJsonValidation should enable");
  assert(isFeatureEnabled("promptVersioning", "org_phase6"), "promptVersioning should enable");
  assert(isFeatureEnabled("aiRegressionEnforcement", "org_phase6"), "aiRegressionEnforcement should enable");
  clearOrganizationFeatureFlag("org_phase6", "strictJsonValidation");
  clearOrganizationFeatureFlag("org_phase6", "promptVersioning");
  clearOrganizationFeatureFlag("org_phase6", "aiRegressionEnforcement");
  assert(!isFeatureEnabled("strictJsonValidation", "org_phase6"), "strictJsonValidation should disable");
  assert(!isFeatureEnabled("promptVersioning", "org_phase6"), "promptVersioning should disable");
  assert(!isFeatureEnabled("aiRegressionEnforcement", "org_phase6"), "aiRegressionEnforcement should disable");
}
