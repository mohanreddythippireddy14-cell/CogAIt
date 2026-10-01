import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ArrowLeft, RotateCcw, Brain, Send, Sparkles, Loader2, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { ContentBlocksRenderer } from "./ContentBlocksRenderer";
import { useState, useEffect, useRef } from "react";

const anyApi = api as any;

export function StudentResults() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const report = useQuery(
    api.attempts.getResultsReport,
    assignmentId ? { assignmentId: assignmentId as Id<"assignments"> } : "skip",
  );
  const assignment = useQuery(
    api.assignments.getAssignmentQuestions,
    assignmentId ? { assignmentId: assignmentId as Id<"assignments"> } : "skip",
  );
  const redoAssignment = useMutation(api.attempts.redoAssignment);

  const handleRedo = async () => {
    if (!assignmentId) return;
    try {
      await redoAssignment({ assignmentId: assignmentId as Id<"assignments"> });
      toast.success("Assignment has been reset!");
      navigate(`/student/assignment/${assignmentId}/question/1`, { replace: true });
    } catch (e) {
      toast.error("Failed to redo assignment");
      console.error(e);
    }
  };

  if (report === undefined || assignment === undefined) {
    return <div className="ui-page text-subtle">Loading results...</div>;
  }

  const questionById = new Map(assignment.map((q) => [q._id.toString(), q]));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/student/dashboard")}
          className="inline-flex items-center text-sm text-muted hover:text-[var(--color-text)]"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Dashboard
        </button>

        <button
          onClick={handleRedo}
          className="inline-flex items-center text-sm text-primary hover:text-primary/80"
        >
          <RotateCcw className="mr-1 h-4 w-4" />
          Redo Assignment
        </button>
      </div>

      <div className="spatial-widget p-5">
        <h1 className="text-2xl font-semibold">{report.assignmentTitle}</h1>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-5">
          <Stat label="Questions Attempted" value={`${report.completedQuestions}/${report.totalQuestions}`} />
          <Stat label="Overall CIS" value={`${report.overallCis}/100`} />
          <Stat label="Total Help Requests" value={`${report.totalHelpRequests}`} />
          <Stat label="Overtime" value={`${Math.max(0, Math.round(report.overtimeSeconds / 60))} min`} />
          <Stat label="Attempted (Draft+Submit)" value={`${report.attemptedQuestions}`} />
        </div>
      </div>

      {/* AI Analyst Chat Panel */}
      {assignmentId && (
        <AgentChatPanel assignmentId={assignmentId as Id<"assignments">} />
      )}

      <div className="spatial-widget p-5">
        <h2 className="text-lg font-semibold text-white">Question Breakdown</h2>
        <div className="mt-4 space-y-3">
          {report.perQuestion.map((row) => (
            <div key={row.questionId} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-white">Q{row.questionNumber} - {row.topic}</div>
                <div className="text-xs text-white/60">
                  {row.result === "completed" ? "Completed" : "Not attempted"} | CIS {row.cisScore}
                </div>
              </div>
              <div className="mt-2 text-xs text-white/60">
                Time: {row.timeSpentSeconds ? `${Math.round(row.timeSpentSeconds / 60)}m` : "--"} | Help: {row.helpRequests} |
                Levels: {row.helpLevelsUsed.length > 0 ? row.helpLevelsUsed.join(", ") : "None"} |
                Independence: {row.independenceScore ?? 0}
              </div>
              <ContentBlocksRenderer
                className="mt-2 text-sm text-white/70"
                contentBlocks={(questionById.get(row.questionId.toString()) as any)?.contentBlocks}
                fallbackText={questionById.get(row.questionId.toString())?.questionText ?? ""}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="spatial-widget p-5">
        <h2 className="text-lg font-semibold text-white">Concept Heatmap</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {report.heatmap.map((cell) => (
            <div
              key={`${cell.subject}-${cell.topic}-${cell.subtopic ?? ""}`}
              className={`rounded-xl border p-3 ${cell.avgCis >= 75 ? "bg-[rgba(16,185,129,0.15)] border-[rgba(16,185,129,0.3)]" : cell.avgCis >= 50 ? "bg-[rgba(245,158,11,0.15)] border-[rgba(245,158,11,0.3)]" : "bg-[rgba(239,68,68,0.15)] border-[rgba(239,68,68,0.3)]"}`}
            >
              <div className="font-medium text-white">{cell.subject} - {cell.topic}{cell.subtopic ? ` / ${cell.subtopic}` : ""}</div>
              <div className="mt-1 text-xs text-white/70">
                Attempts: {cell.attemptedCount} | Avg CIS: {cell.avgCis} | Dependency: {cell.dependencyPercent}%
              </div>
              <div className="text-xs text-white/70">
                Avg Help: {cell.avgHelpRequests} | Avg Independence: {cell.avgIndependence}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Agent Chat Panel Component
// ───────────────────────────────────────────────────────────
function AgentChatPanel({ assignmentId }: { assignmentId: Id<"assignments"> }) {
  const conversation = useQuery(anyApi.agentConversation.getConversation, { assignmentId }) as {
    _id: Id<"agentConversations">;
    messages: Array<{ role: "agent" | "student"; content: string; timestamp: number }>;
    status: "active" | "closed";
    deepDiveRequested: boolean;
  } | null | undefined;

  const deepDiveStatus = useQuery(anyApi.deepDive.getDeepDiveStatus, { sourceAssignmentId: assignmentId }) as {
    _id: Id<"deepDiveSessions">;
    status: "pending" | "generating" | "ready" | "failed";
    generatedAssignmentId?: Id<"assignments">;
    questionCount?: number;
    error?: string;
    weakTopics: string[];
  } | null | undefined;

  const startAnalysis = useAction(anyApi.agentConversation.startAnalysis);
  const sendMessage = useAction(anyApi.agentConversation.sendMessage);
  const generateDeepDive = useAction(anyApi.deepDive.generateDeepDive);

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isGeneratingDeepDive, setIsGeneratingDeepDive] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasStartedRef = useRef(false);

  // Auto-start the analysis when the panel loads
  useEffect(() => {
    if (conversation === null && !hasStartedRef.current && !isInitializing) {
      hasStartedRef.current = true;
      setIsInitializing(true);
      startAnalysis({ assignmentId })
        .catch((err: Error) => {
          console.error("Failed to start analysis:", err);
          toast.error("Failed to start AI analysis");
        })
        .finally(() => setIsInitializing(false));
    }
  }, [conversation, assignmentId, startAnalysis, isInitializing]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages?.length]);

  const handleSend = async () => {
    if (!inputValue.trim() || !conversation || isSending) return;
    const msg = inputValue.trim();
    setInputValue("");
    setIsSending(true);
    try {
      await sendMessage({
        conversationId: conversation._id,
        assignmentId,
        message: msg,
      });
    } catch (err) {
      console.error("Failed to send:", err);
      toast.error("Failed to send message");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleStartDeepDive = async () => {
    if (!conversation) return;
    setIsGeneratingDeepDive(true);

    // Extract weak topics from the conversation context
    const convoData = conversation as any;
    const weakTopics: string[] = convoData.weakTopics ?? [];

    // Collect student preferences from the conversation
    const studentMessages = conversation.messages
      .filter((m) => m.role === "student")
      .map((m) => m.content)
      .join("; ");

    try {
      await generateDeepDive({
        sourceAssignmentId: assignmentId,
        weakTopics: weakTopics.length > 0 ? weakTopics : ["General Review"],
        studentPreferences: studentMessages || undefined,
      });
      toast.success("Deep dive session is being prepared!");
    } catch (err) {
      console.error("Failed to start deep dive:", err);
      toast.error("Failed to create deep dive session");
    } finally {
      setIsGeneratingDeepDive(false);
    }
  };

  const navigate = useNavigate();

  return (
    <div className="spatial-widget widget-purple overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-5 py-4 bg-[rgba(255,255,255,0.04)] border-b border-[var(--color-border)] text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Brain className="h-5 w-5" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-sm">CogAIt Assignment Analyst</h3>
            <p className="text-xs text-white/50">
              {conversation?.deepDiveRequested
                ? "Deep dive ready"
                : conversation
                  ? "Analyzing your performance..."
                  : "Initializing analysis..."}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>

      {/* Chat body */}
      {expanded && (
        <div className="flex flex-col">
          {/* Messages area */}
          <div className="max-h-[420px] overflow-y-auto p-5 space-y-4">
            {/* Loading state */}
            {(conversation === undefined || isInitializing) && (
              <div className="flex items-center gap-3 text-indigo-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">Analyzing your assignment performance...</span>
              </div>
            )}

            {/* Messages */}
            {conversation?.messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "student" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed backdrop-blur-sm ${
                    msg.role === "agent"
                      ? "bg-[rgba(255,255,255,0.04)] border border-[var(--color-border)] text-white/80 shadow-sm"
                      : "bg-[rgba(72,32,220,0.5)] text-white"
                  }`}
                >
                  {msg.role === "agent" && (
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-indigo-600">
                      <Sparkles className="h-3 w-3" />
                      CogAIt Analyst
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>
              </div>
            ))}

            {/* Sending indicator */}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-[rgba(255,255,255,0.04)] border border-[var(--color-border)] rounded-2xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-violet-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {/* Deep dive status */}
            {deepDiveStatus && (
              <DeepDiveStatusCard
                status={deepDiveStatus}
                onNavigate={(id) => navigate(`/student/assignment/${id}/question/1`)}
                onRetry={handleStartDeepDive}
              />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Deep dive action CTA */}
          {conversation?.deepDiveRequested && !deepDiveStatus && (
            <div className="px-5 pb-3">
              <button
                onClick={handleStartDeepDive}
                disabled={isGeneratingDeepDive}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-medium text-sm hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 transition-all shadow-md hover:shadow-lg"
              >
                {isGeneratingDeepDive ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparing your deep dive...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Start Deep Dive Practice Session
                  </>
                )}
              </button>
            </div>
          )}

          {/* Input area */}
          {conversation && conversation.status === "active" && (
            <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Reply to the analyst..."
                  disabled={isSending}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--color-border)] bg-transparent text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-solid)] focus:border-transparent disabled:opacity-50 placeholder:text-white/40"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={isSending || !inputValue.trim()}
                  className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Deep Dive Status Card
// ───────────────────────────────────────────────────────────
function DeepDiveStatusCard({
  status,
  onNavigate,
  onRetry,
}: {
  status: {
    status: "pending" | "generating" | "ready" | "failed";
    generatedAssignmentId?: Id<"assignments">;
    questionCount?: number;
    error?: string;
    weakTopics: string[];
  };
  onNavigate: (id: string) => void;
  onRetry?: () => void;
}) {
  if (status.status === "pending" || status.status === "generating") {
    return (
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
          <div>
            <p className="text-sm font-semibold text-violet-900">
              Agent 5 is preparing your deep dive...
            </p>
            <p className="text-xs text-violet-600 mt-1">
              Searching for concepts and practice questions on: {status.weakTopics.join(", ")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status.status === "ready" && status.generatedAssignmentId) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Deep Dive Ready!
            </p>
            <p className="text-xs text-emerald-700 mt-1">
              {status.questionCount ?? 0} practice questions on: {status.weakTopics.join(", ")}
            </p>
          </div>
          <button
            onClick={() => onNavigate(status.generatedAssignmentId!)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Start Practice
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (status.status === "failed") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-semibold text-red-800">Deep dive generation failed</p>
            <p className="text-xs text-red-600 mt-1">{status.error ?? "Unknown error"}</p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-medium hover:bg-red-200 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-[var(--color-surface-soft)] p-3">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}
