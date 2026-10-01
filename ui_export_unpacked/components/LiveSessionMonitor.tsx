import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export function LiveSessionMonitor() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const data = useQuery(
    (api as any).sessions.getLiveSessionData,
    assignmentId ? { assignmentId: assignmentId as Id<"assignments"> } : "skip",
  ) as
    | Array<{
        studentId: Id<"users">;
        studentName: string;
        currentQuestionNumber: number;
        totalQuestions: number;
        elapsedSeconds: number;
        liveCis: number;
        helpRequests: number;
        status: "solving" | "thinking" | "using_ai" | "stuck";
        violations: number;
      }>
    | undefined;
  const sendHint = useMutation((api as any).interventions.sendLecturerHint);
  const [selectedStudentId, setSelectedStudentId] = useState<Id<"users"> | null>(null);
  const [hintMessage, setHintMessage] = useState("");
  const [sending, setSending] = useState(false);

  const selectedStudent = data?.find((row) => row.studentId === selectedStudentId) ?? null;

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-5">
      <button
        onClick={() => navigate("/lecturer/dashboard?section=interventions")}
        className="inline-flex items-center text-sm text-muted hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back
      </button>
      <div className="spatial-widget p-5">
        <h1 className="text-2xl font-semibold">Live Session Monitor</h1>
        <p className="text-sm text-subtle mt-1">Realtime per-student assignment activity.</p>
      </div>

      <div className="spatial-widget p-4 overflow-x-auto">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Question</th>
              <th>Elapsed</th>
              <th>Live CIS</th>
              <th>Help</th>
              <th>Status</th>
              <th>Violations</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row) => (
              <tr key={row.studentId}>
                <td className="font-medium">{row.studentName}</td>
                <td>Q{row.currentQuestionNumber}/{row.totalQuestions}</td>
                <td>{Math.floor(row.elapsedSeconds / 60)}m</td>
                <td className={`font-medium ${row.liveCis >= 60 ? "text-[var(--color-success)]" : row.liveCis >= 30 ? "text-[var(--color-warning)]" : "text-[var(--color-danger)]"}`}>
                  {row.liveCis}
                </td>
                <td className={`${row.helpRequests > 5 ? "text-[var(--color-danger)]" : row.helpRequests >= 3 ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"}`}>
                  {row.helpRequests}
                </td>
                <td className="capitalize">{row.status.replace("_", " ")}</td>
                <td>{row.violations}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(row.studentId);
                      setHintMessage("");
                    }}
                    className="ui-button ui-button-secondary px-3 py-1"
                  >
                    Intervene
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedStudent && assignmentId && (
        <div className="ui-modal-backdrop">
          <div className="ui-modal max-w-md">
            <h3 className="text-lg font-semibold">Send hint to {selectedStudent.studentName}</h3>
            <textarea
              className="mt-3 auth-input-field text-sm"
              rows={4}
              placeholder="Type a private lecturer hint..."
              value={hintMessage}
              onChange={(e) => setHintMessage(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedStudentId(null)}
                className="ui-button ui-button-secondary px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending || hintMessage.trim().length < 3}
                onClick={async () => {
                  setSending(true);
                  try {
                    await sendHint({
                      assignmentId: assignmentId as Id<"assignments">,
                      studentId: selectedStudent.studentId,
                      message: hintMessage.trim(),
                    });
                    toast.success("Hint delivered");
                    setSelectedStudentId(null);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : "Failed to send hint";
                    toast.error(message);
                  } finally {
                    setSending(false);
                  }
                }}
                className="ui-button ui-button-primary px-4 py-2 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send Hint"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


