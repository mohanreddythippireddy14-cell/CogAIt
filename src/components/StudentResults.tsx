import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ArrowLeft, RotateCcw, Brain, Send, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { ContentBlocksRenderer } from "./ContentBlocksRenderer";
import { RemediationConsent } from "./RemediationConsent";
import { useState, useEffect, useRef } from "react";

const anyApi = api as any;

export function StudentResults() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const user = useQuery(anyApi.users.loggedInUserWithProfile) as
    | { userId: Id<"users">; profile: { role: "student" | "lecturer" | "organizationAdmin" } }
    | null
    | undefined;
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
  const AGENT_BASE_URL = import.meta.env.VITE_AGENT_URL || "";

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
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-6">
          <Stat label="Questions Attempted" value={`${report.completedQuestions}/${report.totalQuestions}`} />
          <Stat label="Overall CIS" value={`${report.overallCis}/100`} />
          <Stat label="Independence" value={`${report.overallIndependenceScore}/100`} />
          <Stat label="Total Help Requests" value={`${report.totalHelpRequests}`} />
          <Stat label="Overtime" value={`${Math.max(0, Math.round(report.overtimeSeconds / 60))} min`} />
          <Stat label="Attempted (Draft+Submit)" value={`${report.attemptedQuestions}`} />
        </div>
      </div>

      {/* AI Analyst Chat Panel */}
      {assignmentId && (
        <AgentChatPanel assignmentId={assignmentId as Id<"assignments">} report={report} />
      )}
      {/* TODO: Surface Agent 2/3 remediation readiness + weak topics once exposed to Convex from agents layer. */}

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
                Independence: {row.independenceScore === undefined ? "Not calculated" : row.independenceScore}
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

// ───────────────────────────────────────────────────────────────────
// Agent Chat Panel Component
// ───────────────────────────────────────────────────────────────────
function AgentChatPanel({
  assignmentId,
  report,
}: {
  assignmentId: Id<"assignments">;
  report: {
    assignmentTitle: string;
    completedQuestions: number;
    totalQuestions: number;
    totalHelpRequests: number;
    heatmap: Array<{
      topic: string;
      avgCis: number;
      dependencyPercent: number;
    }>;
  };
}) {
  const conversation = useQuery(anyApi.agentConversation.getConversation, { assignmentId }) as {
    _id: Id<"agentConversations">;
    messages: Array<{ role: "agent" | "student"; content: string; timestamp: number }>;
    status: "active" | "closed";
  } | null | undefined;

  const startAnalysis = useAction(anyApi.agentConversation.startAnalysis);
  const sendMessage = useAction(anyApi.agentConversation.sendMessage);

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
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

      if (conversation.status === "negotiating") {
        fetch(`${import.meta.env.VITE_AGENT_URL || ''}/agent-negotiation/webhook/student_reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation._id,
            student_id: conversation.messages?.[0]?.role === "student" ? "student" : "student", // We need studentId ideally, but Agent can look it up via conversation_id
            message: msg
          }),
        }).catch(err => console.error("Negotiation webhook failed:", err));
      }
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

  const weakTopics = report.heatmap
    .filter((cell) => cell.avgCis < 60 || cell.dependencyPercent > 50)
    .map((cell) => cell.topic)
    .slice(0, 3);
  const strongTopics = report.heatmap
    .filter((cell) => cell.avgCis >= 75 && cell.dependencyPercent <= 20)
    .map((cell) => cell.topic)
    .slice(0, 3);

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
            <h3 className="font-semibold text-sm">
              {conversation?.status === "analyzing" ? "CogAIt Assistant" : 
               conversation?.status === "negotiating" ? "CogAIt Assistant" : 
               conversation?.status === "searching" ? "CogAIt Web Search" : "CogAIt Assistant"}
            </h3>
            <p className="text-xs text-white/50">
              {conversation?.status === "analyzing" ? "Analyzing your performance..." : 
               conversation?.status === "negotiating" ? "Discussing next steps" :
               conversation?.status === "searching" ? "Gathering practice materials..." : "Ready"}
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
            <div className="rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-white/80">
              <p className="font-semibold text-white">Performance snapshot</p>
              <p className="mt-2">
                You attempted {report.completedQuestions}/{report.totalQuestions} questions with{" "}
                {report.totalHelpRequests} help requests.
              </p>
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-white">Weak topics:</span>{" "}
                  {weakTopics.length > 0 ? weakTopics.join(", ") : "No weak-topic cluster detected yet."}
                </div>
                <div>
                  <span className="font-semibold text-white">Stronger areas:</span>{" "}
                  {strongTopics.length > 0 ? strongTopics.join(", ") : "Keep working through all topics."}
                </div>
              </div>
            </div>

            {/* Loading state */}
            {(conversation === undefined || isInitializing) && (
              <div className="flex items-center gap-3 text-indigo-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm font-medium">Capturing your session log...</span>
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
                      CogAIt Assistant
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

            <div ref={messagesEndRef} />
          </div>

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
                  placeholder="Reply to the assistant..."
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-[var(--color-surface-soft)] p-3">
      <div className="text-xs uppercase tracking-wide text-subtle">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}
