import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useNavigate, useParams } from "react-router-dom";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

export function EditAssignment() {
  const navigate = useNavigate();
  const { assignmentId } = useParams<{ assignmentId: Id<"assignments"> }>();
  const anyApi = api as any;

  const assignment = useQuery(
    anyApi.assignments.getLecturerAssignmentForEdit,
    assignmentId ? { assignmentId } : "skip",
  ) as
    | {
        _id: Id<"assignments">;
        title: string;
        subject?: "Physics" | "Chemistry" | "Math";
        chapter?: string;
        difficulty?: "easy" | "medium" | "hard" | "mixed";
        description?: string;
        dueDate?: number;
        instructions?: string;
        timeLimitMinutes: number;
        allowedLevels?: number[];
        isActive: boolean;
        questionCount: number;
      }
    | null
    | undefined;
  const questions = useQuery(
    anyApi.assignments.getLecturerAssignmentQuestions,
    assignmentId ? { assignmentId } : "skip",
  ) as
    | Array<{
        _id: Id<"questions">;
        questionNumber: number;
        questionText: string;
        subject: "Physics" | "Chemistry" | "Math";
        topic: string;
        difficulty: "easy" | "medium" | "hard";
        givenVariables?: string;
        correctAnswer?: string;
      }>
    | undefined;

  const updateAssignmentBasics = useMutation(anyApi.assignments.updateAssignmentBasics);
  const toggleAssignmentActive = useMutation(anyApi.assignments.toggleAssignmentActive);
  const updateQuestion = useMutation(anyApi.assignments.updateLecturerAssignmentQuestion);
  const addQuestion = useMutation(anyApi.assignments.addLecturerAssignmentQuestion);
  const deleteQuestion = useMutation(anyApi.assignments.deleteLecturerAssignmentQuestion);

  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [form, setForm] = useState({
    title: "",
    subject: "Physics" as "Physics" | "Chemistry" | "Math",
    chapter: "",
    difficulty: "mixed" as "easy" | "medium" | "hard" | "mixed",
    description: "",
    dueDate: "",
    instructions: "",
    timeLimitMinutes: "90",
  });

  const initialized = useMemo(() => form.title.length > 0, [form.title.length]);
  useEffect(() => {
    if (!initialized && assignment) {
      setForm({
        title: assignment.title,
        subject: assignment.subject ?? "Physics",
        chapter: assignment.chapter ?? "",
        difficulty: assignment.difficulty ?? "mixed",
        description: assignment.description ?? "",
        dueDate: assignment.dueDate ? new Date(assignment.dueDate).toISOString().slice(0, 10) : "",
        instructions: assignment.instructions ?? "",
        timeLimitMinutes: String(assignment.timeLimitMinutes),
      });
    }
  }, [initialized, assignment]);

  const [questionDrafts, setQuestionDrafts] = useState<
    Record<
      string,
      {
        questionText: string;
        subject: "Physics" | "Chemistry" | "Math";
        topic: string;
        difficulty: "easy" | "medium" | "hard";
        givenVariables: string;
        correctAnswer: string;
      }
    >
  >({});

  useEffect(() => {
    if (!questions) {
      return;
    }
    const next: Record<
      string,
      {
        questionText: string;
        subject: "Physics" | "Chemistry" | "Math";
        topic: string;
        difficulty: "easy" | "medium" | "hard";
        givenVariables: string;
        correctAnswer: string;
      }
    > = {};
    for (const q of questions) {
      next[q._id] = {
        questionText: q.questionText,
        subject: q.subject,
        topic: q.topic,
        difficulty: q.difficulty,
        givenVariables: q.givenVariables ?? "",
        correctAnswer: q.correctAnswer ?? "",
      };
    }
    setQuestionDrafts(next);
  }, [questions]);

  if (!assignmentId) {
    return <div className="p-8">Invalid assignment id.</div>;
  }

  if (assignment === undefined) {
    return <div className="p-8">Loading assignment...</div>;
  }

  if (assignment === null) {
    return <div className="p-8">Assignment not found.</div>;
  }

  const onSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    const parsedTime = Number(form.timeLimitMinutes);
    if (!Number.isFinite(parsedTime)) {
      toast.error("Time limit must be a number");
      return;
    }
    if (parsedTime < 30) {
      toast.error("Time limit must be at least 30 minutes");
      return;
    }
    if (parsedTime > 180) {
      toast.error("Time limit must be at most 180 minutes");
      return;
    }
    setSaving(true);
    try {
      await updateAssignmentBasics({
        assignmentId,
        title: form.title.trim(),
        subject: form.subject,
        chapter: form.chapter.trim() || undefined,
        difficulty: form.difficulty,
        description: form.description.trim() || undefined,
        dueDate: form.dueDate ? new Date(form.dueDate).getTime() : undefined,
        instructions: form.instructions.trim() || undefined,
        timeLimitMinutes: parsedTime,
      });
      toast.success("Assignment updated");
      navigate("/lecturer/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update assignment";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async () => {
    setToggling(true);
    try {
      await toggleAssignmentActive({ assignmentId });
      toast.success(`Assignment ${assignment.isActive ? "deactivated" : "activated"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update assignment status";
      toast.error(message);
    } finally {
      setToggling(false);
    }
  };

  const onAddQuestion = async () => {
    setAddingQuestion(true);
    try {
      await addQuestion({ assignmentId });
      setShowQuestions(true);
      toast.success("Question added");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add question";
      toast.error(message);
    } finally {
      setAddingQuestion(false);
    }
  };

  const onSaveQuestion = async (questionId: Id<"questions">) => {
    const draft = questionDrafts[questionId];
    if (!draft) {
      return;
    }
    if (!draft.questionText.trim()) {
      toast.error("Question text is required");
      return;
    }
    if (!draft.topic.trim()) {
      toast.error("Topic is required");
      return;
    }

    setSavingQuestionId(questionId);
    try {
      await updateQuestion({
        questionId,
        questionText: draft.questionText.trim(),
        subject: draft.subject,
        topic: draft.topic.trim(),
        difficulty: draft.difficulty,
        givenVariables: draft.givenVariables.trim() || undefined,
        correctAnswer: draft.correctAnswer.trim() || undefined,
      });
      toast.success("Question updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update question";
      toast.error(message);
    } finally {
      setSavingQuestionId(null);
    }
  };

  const onDeleteQuestion = async (questionId: Id<"questions">) => {
    setDeletingQuestionId(questionId);
    try {
      await deleteQuestion({ questionId });
      toast.success("Question deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete question";
      toast.error(message);
    } finally {
      setDeletingQuestionId(null);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Assignment</h1>
        <button
          onClick={() => navigate("/lecturer/dashboard")}
          className="ui-button ui-button-secondary px-4 py-2"
        >
          Back
        </button>
      </div>

      <div className="spatial-widget p-6 space-y-4">
        <div>
          <p className="text-sm text-white/50">Questions</p>
          <p className="font-medium">{assignment.questionCount}</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Title</label>
          <input
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            className="auth-input-field"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            rows={3}
            className="auth-input-field"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-2">Subject</label>
            <select
              value={form.subject}
              onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value as "Physics" | "Chemistry" | "Math" }))}
              className="auth-input-field"
            >
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
              <option value="Math">Math</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Chapter</label>
            <input
              value={form.chapter}
              onChange={(e) => setForm((prev) => ({ ...prev, chapter: e.target.value }))}
              className="auth-input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Difficulty</label>
            <select
              value={form.difficulty}
              onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value as "easy" | "medium" | "hard" | "mixed" }))}
              className="auth-input-field"
            >
              <option value="mixed">Mixed</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-2">Due Date</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              className="auth-input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Instructions</label>
            <input
              value={form.instructions}
              onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
              className="auth-input-field"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Time Limit (minutes)</label>
          <input
            type="number"
            min={30}
            max={180}
            value={form.timeLimitMinutes}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                timeLimitMinutes: e.target.value,
              }))
            }
            className="auth-input-field"
          />
        </div>
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => void onToggle()}
            disabled={toggling}
            className="px-4 py-2 ui-button ui-button-secondary rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            {toggling ? "Updating..." : assignment.isActive ? "Deactivate" : "Activate"}
          </button>
          <button
            onClick={() => void onSave()}
            disabled={saving}
            className="px-4 py-2 ui-button ui-button-primary rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      <div className="spatial-widget p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Assignment Questions</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowQuestions((prev) => !prev)}
              className="ui-button ui-button-secondary px-4 py-2"
            >
              {showQuestions ? "Hide Questions" : "View Questions"}
            </button>
            <button
              onClick={() => void onAddQuestion()}
              disabled={addingQuestion}
              className="px-4 py-2 ui-button ui-button-primary rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {addingQuestion ? "Adding..." : "Add Question"}
            </button>
          </div>
        </div>

        {showQuestions && (
          <div className="space-y-4">
            {!questions || questions.length === 0 ? (
              <p className="text-sm text-white/60">No questions in this assignment.</p>
            ) : (
              questions.map((q) => {
                const draft = questionDrafts[q._id];
                if (!draft) return null;
                return (
                  <div key={q._id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Question {q.questionNumber}</p>
                      <button
                        onClick={() => void onDeleteQuestion(q._id)}
                        disabled={deletingQuestionId === q._id}
                        className="text-sm text-[var(--color-danger)] hover:text-red-400 disabled:opacity-50"
                      >
                        {deletingQuestionId === q._id ? "Deleting..." : "Delete"}
                      </button>
                    </div>

                    <textarea
                      rows={3}
                      className="auth-input-field"
                      value={draft.questionText}
                      onChange={(e) =>
                        setQuestionDrafts((prev) => ({
                          ...prev,
                          [q._id]: { ...prev[q._id], questionText: e.target.value },
                        }))
                      }
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <select
                        className="auth-input-field"
                        value={draft.subject}
                        onChange={(e) =>
                          setQuestionDrafts((prev) => ({
                            ...prev,
                            [q._id]: { ...prev[q._id], subject: e.target.value as "Physics" | "Chemistry" | "Math" },
                          }))
                        }
                      >
                        <option value="Physics">Physics</option>
                        <option value="Chemistry">Chemistry</option>
                        <option value="Math">Math</option>
                      </select>
                      <input
                        className="auth-input-field"
                        value={draft.topic}
                        onChange={(e) =>
                          setQuestionDrafts((prev) => ({
                            ...prev,
                            [q._id]: { ...prev[q._id], topic: e.target.value },
                          }))
                        }
                        placeholder="Topic"
                      />
                      <select
                        className="auth-input-field"
                        value={draft.difficulty}
                        onChange={(e) =>
                          setQuestionDrafts((prev) => ({
                            ...prev,
                            [q._id]: {
                              ...prev[q._id],
                              difficulty: e.target.value as "easy" | "medium" | "hard",
                            },
                          }))
                        }
                      >
                        <option value="easy">easy</option>
                        <option value="medium">medium</option>
                        <option value="hard">hard</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        className="auth-input-field"
                        value={draft.givenVariables}
                        onChange={(e) =>
                          setQuestionDrafts((prev) => ({
                            ...prev,
                            [q._id]: { ...prev[q._id], givenVariables: e.target.value },
                          }))
                        }
                        placeholder="Given variables (optional)"
                      />
                      <input
                        className="auth-input-field"
                        value={draft.correctAnswer}
                        onChange={(e) =>
                          setQuestionDrafts((prev) => ({
                            ...prev,
                            [q._id]: { ...prev[q._id], correctAnswer: e.target.value },
                          }))
                        }
                        placeholder="Correct answer (optional)"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => void onSaveQuestion(q._id)}
                        disabled={savingQuestionId === q._id}
                        className="px-4 py-2 ui-button ui-button-primary rounded-lg hover:bg-blue-600 disabled:opacity-50"
                      >
                        {savingQuestionId === q._id ? "Saving..." : "Save Question"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}


