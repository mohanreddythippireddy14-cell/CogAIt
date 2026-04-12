export function validateDraftInput(params: {
  inputType: "pdf" | "text";
  sourceTextLength?: number;
  allowedLevels: number[];
}) {
  if (params.allowedLevels.length === 0) {
    throw new Error("Select at least one help level.");
  }
  if (params.inputType === "text" && (params.sourceTextLength ?? 0) < 100) {
    throw new Error("Text input is too short. Please provide at least 100 characters.");
  }
}
