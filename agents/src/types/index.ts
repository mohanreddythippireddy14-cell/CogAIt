// ----------------------------------------------------------------------------
// CogAIt Agentic Layer - Strict I/O Contracts
// Enforces A2A (Agent-to-Agent) type discipline across all Cloud Run services.
// ----------------------------------------------------------------------------

// ==========================================
// SHARED DOMAIN TYPES
// ==========================================
export type ReasoningQuality = 'genuine' | 'shallow' | 'guessing';
export type RemediationPreference = 'pyqs' | 'fundamentals' | 'theory' | 'all';
export type TopicClassification = 'strong' | 'developing' | 'weak';
export type TrendDirection = 'improving' | 'stable' | 'declining';
export type EvalType = 'policy_violation' | 'schema_failure' | 'latency_spike' | 'error_rate';

export interface SessionLog {
  question: string;
  student_input: string;
  scaffolding_depth: number;
  timestamp: string;
}

export interface ProctoringSignal {
  type: string;
  severity: number;
  timestamp: string;
}

// ==========================================
// AGENT 1: Socratic Agent
// ==========================================
export interface SocraticAgentInput {
  student_id: string;
  problem_id: string;
  student_reasoning_input: string;
  current_scaffolding_depth: number;
}

export interface SocraticAgentOutput {
  socratic_question: string;
  scaffolding_depth_applied: number;
  reasoning_quality_signal: ReasoningQuality;
}

// ==========================================
// AGENT 2: Assignment Analyst
// ==========================================
export interface AssignmentAnalystInput {
  student_id: string;
  assignment_id: string;
  session_log: SessionLog[];
  proctoring_signals: ProctoringSignal[];
}

export interface TopicPerformance {
  topic_name: string;
  max_scaffold_depth: number;
  classification: TopicClassification;
}

export interface AssignmentAnalystOutput {
  student_id: string;
  assignment_id: string;
  topic_performance: TopicPerformance[];
  weak_topics: string[];
  strong_topics: string[];
  remediation_recommended: boolean;
  time_available_for_remediation: boolean;
  session_integrity_score: number; // 0.0 - 1.0
}

// ==========================================
// AGENT 3: Content Agent
// ==========================================
export interface ContentAgentInput {
  student_id: string;
  weak_topics: string[];
  remediation_preference: RemediationPreference;
  time_available_minutes: number;
}

export interface TheorySection {
  heading: string;
  content: string;
}

export interface TimedQuestion {
  question_text: string;
  time_limit_seconds: number;
}

export interface AssignmentPlan {
  phase_1: {
    title: string;
    theory_sections: TheorySection[];
    pace_warning_threshold_minutes: number;
  };
  phase_2: {
    questions: TimedQuestion[];
    total_time_minutes: number;
  };
}

export interface ContentAgentOutput {
  student_id: string;
  assignment: AssignmentPlan;
  content_confidence_score: number;
  human_review_required: boolean;
}

// ==========================================
// AGENT 4: Long-Term Analyst
// ==========================================
export interface LongTermAnalystInput {
  student_id: string;
  report_date: string; // ISO format date
}

export interface TopicTrend {
  topic: string;
  trend: TrendDirection;
  avg_scaffold_depth: number;
  sessions_count: number;
}

export interface LongTermAnalystOutput {
  student_id: string;
  report_date: string;
  cis_trajectory: {
    week_1: number;
    month_1: number;
    month_3: number;
    year_1: number;
  };
  topic_trends: TopicTrend[];
  at_risk: boolean;
  ai_dependency_flag: boolean;
  narrative_summary: string;
}

export type StudentReport = LongTermAnalystOutput;

// ==========================================
// AGENT 5: Assignment Creator
// ==========================================
export interface AssignmentCreatorInput {
  lecturer_id: string;
  document_ai_extracted_text: string;
  source_filename: string;
}

export interface CogAItQuestion {
  text: string;
  options?: string[];
  correct_answer?: string;
  mapped_topic: string;
}

export interface UnmappedItem {
  raw_text: string;
  reason: string;
}

export interface AssignmentCreatorOutput {
  assignment_id: string;
  lecturer_id: string;
  questions: CogAItQuestion[];
  unmapped_items: UnmappedItem[];
  mapping_confidence_avg: number;
}

// ==========================================
// AGENT 6: Cohort Analyst
// ==========================================
export interface CohortAnalystInput {
  batch_id: string;
  student_reports: StudentReport[];
  report_date: string;
}

export interface FailingTopic {
  topic: string;
  failure_rate_pct: number;
  avg_scaffold_depth: number;
}

export interface AtRiskStudent {
  student_id: string;
  reason: string;
}

export interface CohortAnalystOutput {
  batch_id: string;
  report_date: string;
  failing_topics: FailingTopic[];
  at_risk_students: AtRiskStudent[];
  ai_dependency_students: string[];
  cohort_cis_avg: number;
  cohort_cis_trend: TrendDirection;
}

export type CohortIntelligence = CohortAnalystOutput;

// ==========================================
// AGENT 7: Recommendation Agent
// ==========================================
export interface RecommendationAgentInput {
  lecturer_id: string;
  cohort_intelligence: CohortIntelligence;
  report_date: string;
}

export interface PriorityTopic {
  topic: string;
  failure_rate_pct: number;
  recommended_action: string;
}

export interface CriticalAlert {
  alert_text: string;
  severity: "high" | "critical";
}

export interface Intervention {
  target: string;
  action: string;
}

export interface RecommendationAgentOutput {
  lecturer_id: string;
  report_date: string;
  briefing_markdown: string;
  priority_topics: PriorityTopic[];
  at_risk_students: AtRiskStudent[];
  critical_alerts: CriticalAlert[];
  recommended_interventions: Intervention[];
}

// ==========================================
// AGENT 8: The Judge
// ==========================================
export interface JudgeInput {
  evaluation_target: string;
  sample_size: number;
  evaluation_type: EvalType;
}

export interface EvaluationDetail {
  pass: boolean;
  reason: string;
  trace_id?: string;
}

export interface JudgeOutput {
  evaluation_id: string;
  timestamp: string;
  agent_evaluated: string;
  policy_violations_detected: number;
  schema_failures_detected: number;
  latency_anomaly: boolean;
  error_rate_anomaly: boolean;
  alert_fired: boolean;
  evaluation_details: EvaluationDetail[];
}
