export function isGradedSubmission(attempt: { submittedAt?: number; studentAnswer?: string }) {
  return attempt.submittedAt !== undefined && (attempt.studentAnswer ?? "").trim().length > 0;
}
