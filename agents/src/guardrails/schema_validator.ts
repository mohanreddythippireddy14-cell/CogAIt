type Validator = (payload: unknown, path?: string) => void;

const reasoningQualities = new Set(["genuine", "shallow", "guessing"]);
const remediationPreferences = new Set(["pyqs", "fundamentals", "theory", "all"]);
const topicClassifications = new Set(["strong", "developing", "weak"]);
const trendDirections = new Set(["improving", "stable", "declining"]);
const evalTypes = new Set(["policy_violation", "schema_failure", "latency_spike", "error_rate"]);
const alertSeverities = new Set(["high", "critical"]);

function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, path: string, opts?: { minLength?: number }): void {
  if (typeof value !== "string") fail(path, "must be a string");
  if ((opts?.minLength ?? 0) > value.trim().length) fail(path, `must be at least ${opts?.minLength} characters`);
}

function assertNumber(value: unknown, path: string, opts?: { min?: number; max?: number; integer?: boolean }): void {
  if (typeof value !== "number" || Number.isNaN(value)) fail(path, "must be a valid number");
  if (opts?.integer && !Number.isInteger(value)) fail(path, "must be an integer");
  if (opts?.min !== undefined && value < opts.min) fail(path, `must be >= ${opts.min}`);
  if (opts?.max !== undefined && value > opts.max) fail(path, `must be <= ${opts.max}`);
}

function assertBoolean(value: unknown, path: string): void {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
}

function assertIsoDateLike(value: unknown, path: string): void {
  assertString(value, path, { minLength: 1 });
  if (Number.isNaN(Date.parse(value as string))) fail(path, "must be a valid ISO date or timestamp");
}

function assertEnum(value: unknown, allowed: Set<string>, path: string): void {
  assertString(value, path, { minLength: 1 });
  if (!allowed.has(value as string)) fail(path, `must be one of: ${Array.from(allowed).join(", ")}`);
}

function assertArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
}

function assertStringArray(value: unknown, path: string, opts?: { minItems?: number; minLength?: number }): void {
  const items = assertArray(value, path);
  if (opts?.minItems !== undefined && items.length < opts.minItems) fail(path, `must contain at least ${opts.minItems} items`);
  items.forEach((item, index) => assertString(item, `${path}[${index}]`, { minLength: opts?.minLength ?? 0 }));
}

function validateSessionLog(payload: unknown, path = "session_log[]"): void {
  const value = asRecord(payload, path);
  assertString(value.question, `${path}.question`, { minLength: 1 });
  assertString(value.student_input, `${path}.student_input`, { minLength: 1 });
  assertNumber(value.scaffolding_depth, `${path}.scaffolding_depth`, { min: 0, integer: true });
  assertIsoDateLike(value.timestamp, `${path}.timestamp`);
}

function validateProctoringSignal(payload: unknown, path = "proctoring_signals[]"): void {
  const value = asRecord(payload, path);
  assertString(value.type, `${path}.type`, { minLength: 1 });
  assertNumber(value.severity, `${path}.severity`, { min: 0 });
  assertIsoDateLike(value.timestamp, `${path}.timestamp`);
}

function validateTopicPerformance(payload: unknown, path = "topic_performance[]"): void {
  const value = asRecord(payload, path);
  assertString(value.topic_name, `${path}.topic_name`, { minLength: 1 });
  assertNumber(value.max_scaffold_depth, `${path}.max_scaffold_depth`, { min: 0, integer: true });
  assertEnum(value.classification, topicClassifications, `${path}.classification`);
}

function validateTheorySection(payload: unknown, path = "theory_sections[]"): void {
  const value = asRecord(payload, path);
  assertString(value.heading, `${path}.heading`, { minLength: 1 });
  assertString(value.content, `${path}.content`, { minLength: 1 });
}

function validateTimedQuestion(payload: unknown, path = "questions[]"): void {
  const value = asRecord(payload, path);
  assertString(value.question_text, `${path}.question_text`, { minLength: 1 });
  assertNumber(value.time_limit_seconds, `${path}.time_limit_seconds`, { min: 1, integer: true });
}

function validateTopicTrend(payload: unknown, path = "topic_trends[]"): void {
  const value = asRecord(payload, path);
  assertString(value.topic, `${path}.topic`, { minLength: 1 });
  assertEnum(value.trend, trendDirections, `${path}.trend`);
  assertNumber(value.avg_scaffold_depth, `${path}.avg_scaffold_depth`, { min: 0 });
  assertNumber(value.sessions_count, `${path}.sessions_count`, { min: 0, integer: true });
}

function validateLongTermAnalystOutputAt(payload: unknown, path = "LongTermAnalystOutput"): void {
  const value = asRecord(payload, path);
  assertString(value.student_id, `${path}.student_id`, { minLength: 1 });
  assertIsoDateLike(value.report_date, `${path}.report_date`);
  const cis = asRecord(value.cis_trajectory, `${path}.cis_trajectory`);
  assertNumber(cis.week_1, `${path}.cis_trajectory.week_1`);
  assertNumber(cis.month_1, `${path}.cis_trajectory.month_1`);
  assertNumber(cis.month_3, `${path}.cis_trajectory.month_3`);
  assertNumber(cis.year_1, `${path}.cis_trajectory.year_1`);
  assertArray(value.topic_trends, `${path}.topic_trends`).forEach((item, index) =>
    validateTopicTrend(item, `${path}.topic_trends[${index}]`),
  );
  assertBoolean(value.at_risk, `${path}.at_risk`);
  assertBoolean(value.ai_dependency_flag, `${path}.ai_dependency_flag`);
  assertString(value.narrative_summary, `${path}.narrative_summary`, { minLength: 1 });
}

function validateCohortAnalystOutputAt(payload: unknown, path = "CohortAnalystOutput"): void {
  const value = asRecord(payload, path);
  assertString(value.batch_id, `${path}.batch_id`, { minLength: 1 });
  assertIsoDateLike(value.report_date, `${path}.report_date`);
  assertArray(value.failing_topics, `${path}.failing_topics`).forEach((item, index) =>
    validateFailingTopic(item, `${path}.failing_topics[${index}]`),
  );
  assertArray(value.at_risk_students, `${path}.at_risk_students`).forEach((item, index) =>
    validateAtRiskStudent(item, `${path}.at_risk_students[${index}]`),
  );
  assertStringArray(value.ai_dependency_students, `${path}.ai_dependency_students`);
  assertNumber(value.cohort_cis_avg, `${path}.cohort_cis_avg`);
  assertEnum(value.cohort_cis_trend, trendDirections, `${path}.cohort_cis_trend`);
}

function validateCogAItQuestion(payload: unknown, path = "questions[]"): void {
  const value = asRecord(payload, path);
  assertString(value.text, `${path}.text`, { minLength: 1 });
  if (value.options !== undefined) assertStringArray(value.options, `${path}.options`);
  if (value.correct_answer !== undefined) assertString(value.correct_answer, `${path}.correct_answer`, { minLength: 1 });
  assertString(value.mapped_topic, `${path}.mapped_topic`, { minLength: 1 });
}

function validateUnmappedItem(payload: unknown, path = "unmapped_items[]"): void {
  const value = asRecord(payload, path);
  assertString(value.raw_text, `${path}.raw_text`, { minLength: 1 });
  assertString(value.reason, `${path}.reason`, { minLength: 1 });
}

function validateAtRiskStudent(payload: unknown, path = "at_risk_students[]"): void {
  const value = asRecord(payload, path);
  assertString(value.student_id, `${path}.student_id`, { minLength: 1 });
  assertString(value.reason, `${path}.reason`, { minLength: 1 });
}

function validateFailingTopic(payload: unknown, path = "failing_topics[]"): void {
  const value = asRecord(payload, path);
  assertString(value.topic, `${path}.topic`, { minLength: 1 });
  assertNumber(value.failure_rate_pct, `${path}.failure_rate_pct`, { min: 0, max: 100 });
  assertNumber(value.avg_scaffold_depth, `${path}.avg_scaffold_depth`, { min: 0 });
}

function validatePriorityTopic(payload: unknown, path = "priority_topics[]"): void {
  const value = asRecord(payload, path);
  assertString(value.topic, `${path}.topic`, { minLength: 1 });
  assertNumber(value.failure_rate_pct, `${path}.failure_rate_pct`, { min: 0, max: 100 });
  assertString(value.recommended_action, `${path}.recommended_action`, { minLength: 1 });
}

function validateCriticalAlert(payload: unknown, path = "critical_alerts[]"): void {
  const value = asRecord(payload, path);
  assertString(value.alert_text, `${path}.alert_text`, { minLength: 1 });
  assertEnum(value.severity, alertSeverities, `${path}.severity`);
}

function validateIntervention(payload: unknown, path = "recommended_interventions[]"): void {
  const value = asRecord(payload, path);
  assertString(value.target, `${path}.target`, { minLength: 1 });
  assertString(value.action, `${path}.action`, { minLength: 1 });
}

function validateEvaluationDetail(payload: unknown, path = "evaluation_details[]"): void {
  const value = asRecord(payload, path);
  const passValue = value.pass ?? value.passed ?? true;
  const normalizedPass =
    typeof passValue === "boolean"
      ? passValue
      : typeof passValue === "string"
        ? passValue.toLowerCase() === "true"
        : true;
  const reasonValue = value.reason ?? value.details ?? value.check_name ?? "No details provided";
  assertBoolean(normalizedPass, `${path}.pass|passed`);
  assertString(reasonValue, `${path}.reason|details|check_name`, { minLength: 1 });
  if (value.trace_id !== undefined) assertString(value.trace_id, `${path}.trace_id`, { minLength: 1 });
}

const validators: Record<string, Validator> = {
  SocraticAgentInput(payload) {
    const value = asRecord(payload, "SocraticAgentInput");
    assertString(value.student_id, "SocraticAgentInput.student_id", { minLength: 1 });
    assertString(value.problem_id, "SocraticAgentInput.problem_id", { minLength: 1 });
    assertString(value.student_reasoning_input, "SocraticAgentInput.student_reasoning_input", { minLength: 1 });
    assertNumber(value.current_scaffolding_depth, "SocraticAgentInput.current_scaffolding_depth", { min: 0, integer: true });
  },
  SocraticAgentOutput(payload) {
    const value = asRecord(payload, "SocraticAgentOutput");
    assertString(value.socratic_question, "SocraticAgentOutput.socratic_question", { minLength: 2 });
    assertNumber(value.scaffolding_depth_applied, "SocraticAgentOutput.scaffolding_depth_applied", { min: 0, integer: true });
    assertEnum(value.reasoning_quality_signal, reasoningQualities, "SocraticAgentOutput.reasoning_quality_signal");
  },
  AssignmentAnalystInput(payload) {
    const value = asRecord(payload, "AssignmentAnalystInput");
    assertString(value.student_id, "AssignmentAnalystInput.student_id", { minLength: 1 });
    assertString(value.assignment_id, "AssignmentAnalystInput.assignment_id", { minLength: 1 });
    assertArray(value.session_log, "AssignmentAnalystInput.session_log").forEach((item, index) =>
      validateSessionLog(item, `AssignmentAnalystInput.session_log[${index}]`),
    );
    assertArray(value.proctoring_signals, "AssignmentAnalystInput.proctoring_signals").forEach((item, index) =>
      validateProctoringSignal(item, `AssignmentAnalystInput.proctoring_signals[${index}]`),
    );
  },
  AssignmentAnalystOutput(payload) {
    const value = asRecord(payload, "AssignmentAnalystOutput");
    assertString(value.student_id, "AssignmentAnalystOutput.student_id", { minLength: 1 });
    assertString(value.assignment_id, "AssignmentAnalystOutput.assignment_id", { minLength: 1 });
    assertArray(value.topic_performance, "AssignmentAnalystOutput.topic_performance").forEach((item, index) =>
      validateTopicPerformance(item, `AssignmentAnalystOutput.topic_performance[${index}]`),
    );
    assertStringArray(value.weak_topics, "AssignmentAnalystOutput.weak_topics");
    assertStringArray(value.strong_topics, "AssignmentAnalystOutput.strong_topics");
    assertBoolean(value.remediation_recommended, "AssignmentAnalystOutput.remediation_recommended");
    assertBoolean(value.time_available_for_remediation, "AssignmentAnalystOutput.time_available_for_remediation");
    assertNumber(value.session_integrity_score, "AssignmentAnalystOutput.session_integrity_score", { min: 0, max: 1 });
  },
  ContentAgentInput(payload) {
    const value = asRecord(payload, "ContentAgentInput");
    assertString(value.student_id, "ContentAgentInput.student_id", { minLength: 1 });
    assertStringArray(value.weak_topics, "ContentAgentInput.weak_topics", { minItems: 1, minLength: 1 });
    assertEnum(value.remediation_preference, remediationPreferences, "ContentAgentInput.remediation_preference");
    assertNumber(value.time_available_minutes, "ContentAgentInput.time_available_minutes", { min: 1, integer: true });
  },
  ContentAgentOutput(payload) {
    const value = asRecord(payload, "ContentAgentOutput");
    assertString(value.student_id, "ContentAgentOutput.student_id", { minLength: 1 });
    const assignment = asRecord(value.assignment, "ContentAgentOutput.assignment");
    const phase1 = asRecord(assignment.phase_1, "ContentAgentOutput.assignment.phase_1");
    assertString(phase1.title, "ContentAgentOutput.assignment.phase_1.title", { minLength: 1 });
    assertArray(phase1.theory_sections, "ContentAgentOutput.assignment.phase_1.theory_sections").forEach((item, index) =>
      validateTheorySection(item, `ContentAgentOutput.assignment.phase_1.theory_sections[${index}]`),
    );
    assertNumber(phase1.pace_warning_threshold_minutes, "ContentAgentOutput.assignment.phase_1.pace_warning_threshold_minutes", { min: 1, integer: true });
    const phase2 = asRecord(assignment.phase_2, "ContentAgentOutput.assignment.phase_2");
    assertArray(phase2.questions, "ContentAgentOutput.assignment.phase_2.questions").forEach((item, index) =>
      validateTimedQuestion(item, `ContentAgentOutput.assignment.phase_2.questions[${index}]`),
    );
    assertNumber(phase2.total_time_minutes, "ContentAgentOutput.assignment.phase_2.total_time_minutes", { min: 1, integer: true });
    assertNumber(value.content_confidence_score, "ContentAgentOutput.content_confidence_score", { min: 0, max: 1 });
    assertBoolean(value.human_review_required, "ContentAgentOutput.human_review_required");
  },
  LongTermAnalystInput(payload) {
    const value = asRecord(payload, "LongTermAnalystInput");
    assertString(value.student_id, "LongTermAnalystInput.student_id", { minLength: 1 });
    assertIsoDateLike(value.report_date, "LongTermAnalystInput.report_date");
  },
  LongTermAnalystOutput(payload) {
    validateLongTermAnalystOutputAt(payload, "LongTermAnalystOutput");
  },
  AssignmentCreatorInput(payload) {
    const value = asRecord(payload, "AssignmentCreatorInput");
    assertString(value.lecturer_id, "AssignmentCreatorInput.lecturer_id", { minLength: 1 });
    assertString(value.document_ai_extracted_text, "AssignmentCreatorInput.document_ai_extracted_text", { minLength: 1 });
    assertString(value.source_filename, "AssignmentCreatorInput.source_filename", { minLength: 1 });
  },
  AssignmentCreatorOutput(payload) {
    const value = asRecord(payload, "AssignmentCreatorOutput");
    assertString(value.assignment_id, "AssignmentCreatorOutput.assignment_id", { minLength: 1 });
    assertString(value.lecturer_id, "AssignmentCreatorOutput.lecturer_id", { minLength: 1 });
    assertArray(value.questions, "AssignmentCreatorOutput.questions").forEach((item, index) =>
      validateCogAItQuestion(item, `AssignmentCreatorOutput.questions[${index}]`),
    );
    assertArray(value.unmapped_items, "AssignmentCreatorOutput.unmapped_items").forEach((item, index) =>
      validateUnmappedItem(item, `AssignmentCreatorOutput.unmapped_items[${index}]`),
    );
    assertNumber(value.mapping_confidence_avg, "AssignmentCreatorOutput.mapping_confidence_avg", { min: 0, max: 1 });
  },
  CohortAnalystInput(payload) {
    const value = asRecord(payload, "CohortAnalystInput");
    assertString(value.batch_id, "CohortAnalystInput.batch_id", { minLength: 1 });
    assertIsoDateLike(value.report_date, "CohortAnalystInput.report_date");
    assertArray(value.student_reports, "CohortAnalystInput.student_reports").forEach((item, index) =>
      validateLongTermAnalystOutputAt(item, `CohortAnalystInput.student_reports[${index}]`),
    );
  },
  CohortAnalystOutput(payload) {
    validateCohortAnalystOutputAt(payload, "CohortAnalystOutput");
  },
  RecommendationAgentInput(payload) {
    const value = asRecord(payload, "RecommendationAgentInput");
    assertString(value.lecturer_id, "RecommendationAgentInput.lecturer_id", { minLength: 1 });
    assertIsoDateLike(value.report_date, "RecommendationAgentInput.report_date");
    validateCohortAnalystOutputAt(value.cohort_intelligence, "RecommendationAgentInput.cohort_intelligence");
  },
  RecommendationAgentOutput(payload) {
    const value = asRecord(payload, "RecommendationAgentOutput");
    assertString(value.lecturer_id, "RecommendationAgentOutput.lecturer_id", { minLength: 1 });
    assertIsoDateLike(value.report_date, "RecommendationAgentOutput.report_date");
    assertString(value.briefing_markdown, "RecommendationAgentOutput.briefing_markdown", { minLength: 1 });
    assertArray(value.priority_topics, "RecommendationAgentOutput.priority_topics").forEach((item, index) =>
      validatePriorityTopic(item, `RecommendationAgentOutput.priority_topics[${index}]`),
    );
    assertArray(value.at_risk_students, "RecommendationAgentOutput.at_risk_students").forEach((item, index) =>
      validateAtRiskStudent(item, `RecommendationAgentOutput.at_risk_students[${index}]`),
    );
    assertArray(value.critical_alerts, "RecommendationAgentOutput.critical_alerts").forEach((item, index) =>
      validateCriticalAlert(item, `RecommendationAgentOutput.critical_alerts[${index}]`),
    );
    assertArray(value.recommended_interventions, "RecommendationAgentOutput.recommended_interventions").forEach((item, index) =>
      validateIntervention(item, `RecommendationAgentOutput.recommended_interventions[${index}]`),
    );
  },
  JudgeInput(payload) {
    const value = asRecord(payload, "JudgeInput");
    assertString(value.evaluation_target, "JudgeInput.evaluation_target", { minLength: 1 });
    assertNumber(value.sample_size, "JudgeInput.sample_size", { min: 1, integer: true });
    assertEnum(value.evaluation_type, evalTypes, "JudgeInput.evaluation_type");
  },
  JudgeOutput(payload) {
    const value = asRecord(payload, "JudgeOutput");
    assertString(value.evaluation_id ?? "eval_generated", "JudgeOutput.evaluation_id", { minLength: 1 });
    assertIsoDateLike(value.timestamp ?? new Date().toISOString(), "JudgeOutput.timestamp");
    assertString(value.agent_evaluated ?? value.evaluation_target ?? "unknown_agent", "JudgeOutput.agent_evaluated", { minLength: 1 });
    assertNumber(value.policy_violations_detected ?? 0, "JudgeOutput.policy_violations_detected", { min: 0, integer: true });
    assertNumber(value.schema_failures_detected ?? 0, "JudgeOutput.schema_failures_detected", { min: 0, integer: true });
    assertBoolean(value.latency_anomaly ?? false, "JudgeOutput.latency_anomaly");
    assertBoolean(value.error_rate_anomaly ?? false, "JudgeOutput.error_rate_anomaly");
    assertBoolean(value.alert_fired ?? false, "JudgeOutput.alert_fired");
    const details = assertArray(value.evaluation_details ?? [], "JudgeOutput.evaluation_details");
    details.forEach((item, index) => {
      if (typeof item === "object" && item !== null) {
        validateEvaluationDetail(item, `JudgeOutput.evaluation_details[${index}]`);
      }
    });
  },
};

export const validateSchema = <T>(payload: unknown, schemaName: string): T => {
  const validator = validators[schemaName];
  if (!validator) {
    throw new Error(`Unknown schema: ${schemaName}`);
  }
  validator(payload);
  return payload as T;
};
