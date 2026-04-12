import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ContentBlocksRenderer } from "./ContentBlocksRenderer";

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

      <div className="ui-card p-5">
        <h1 className="text-2xl font-semibold">{report.assignmentTitle}</h1>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-5">
          <Stat label="Questions Attempted" value={`${report.completedQuestions}/${report.totalQuestions}`} />
          <Stat label="Overall CIS" value={`${report.overallCis}/100`} />
          <Stat label="Total Help Requests" value={`${report.totalHelpRequests}`} />
          <Stat label="Overtime" value={`${Math.max(0, Math.round(report.overtimeSeconds / 60))} min`} />
          <Stat label="Attempted (Draft+Submit)" value={`${report.attemptedQuestions}`} />
        </div>
      </div>

      <div className="ui-card p-5">
        <h2 className="text-lg font-semibold text-gray-900">Question Breakdown</h2>
        <div className="mt-4 space-y-3">
          {report.perQuestion.map((row) => (
            <div key={row.questionId} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-gray-900">Q{row.questionNumber} - {row.topic}</div>
                <div className="text-xs text-gray-600">
                  {row.result === "completed" ? "Completed" : "Not attempted"} | CIS {row.cisScore}
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-600">
                Time: {row.timeSpentSeconds ? `${Math.round(row.timeSpentSeconds / 60)}m` : "--"} | Help: {row.helpRequests} |
                Levels: {row.helpLevelsUsed.length > 0 ? row.helpLevelsUsed.join(", ") : "None"} |
                Independence: {row.independenceScore ?? 0}
              </div>
              <ContentBlocksRenderer
                className="mt-2 text-sm text-gray-700"
                contentBlocks={(questionById.get(row.questionId.toString()) as any)?.contentBlocks}
                fallbackText={questionById.get(row.questionId.toString())?.questionText ?? ""}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="ui-card p-5">
        <h2 className="text-lg font-semibold text-gray-900">Concept Heatmap</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {report.heatmap.map((cell) => (
            <div
              key={`${cell.subject}-${cell.topic}-${cell.subtopic ?? ""}`}
              className={`rounded-xl border p-3 ${cell.avgCis >= 75 ? "bg-green-50 border-green-200" : cell.avgCis >= 50 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}
            >
              <div className="font-medium text-gray-900">{cell.subject} - {cell.topic}{cell.subtopic ? ` / ${cell.subtopic}` : ""}</div>
              <div className="mt-1 text-xs text-gray-700">
                Attempts: {cell.attemptedCount} | Avg CIS: {cell.avgCis} | Dependency: {cell.dependencyPercent}%
              </div>
              <div className="text-xs text-gray-700">
                Avg Help: {cell.avgHelpRequests} | Avg Independence: {cell.avgIndependence}
              </div>
            </div>
          ))}
        </div>
      </div>
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


