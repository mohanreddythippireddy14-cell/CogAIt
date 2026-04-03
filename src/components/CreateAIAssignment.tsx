import { useEffect, useMemo, useState } from "react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { toast } from "sonner";

type Subject = "Physics" | "Chemistry" | "Math";
type Difficulty = "easy" | "medium" | "hard";

type DraftQuestion = {
  _id: Id<"questions">;
  questionNumber: number;
  questionText: string;
  editedText?: string;
  questionType?: string;
  mcqOptions?: string[];
  correctOption?: "A" | "B" | "C" | "D";
  subject: Subject;
  topic: string;
  difficulty: Difficulty;
  structuredRepresentation?: string;
  correctAnswer?: string;
  aiAnswer?: string;
  confidenceLevel?: "high" | "medium" | "low";
  confidenceScore?: number;
  generationMethod?: string;
  reviewed?: boolean;
  segmentationConfidence?: number;
};

const DISMISSED_PUBLISH_BANNER_KEY = "cogait:dismissed_publish_banner_assignment_v1";

export function CreateAIAssignment() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const anyApi = api as any;
  const convex = useConvex();

  const createDraftFromInput = useMutation(anyApi.facultyAssignments.createDraftFromInput);
  const createDraftRecord = useMutation(anyApi.facultyAssignments.createDraftRecord);
  const processDirectDraftJob = useAction(anyApi.facultyAssignments.processDirectDraftJob);
  const generatePdfUploadUrl = useMutation(anyApi.facultyAssignments.generatePdfUploadUrl);
  const sweepMyStaleProcessingJobs = useMutation(anyApi.facultyAssignments.sweepMyStaleProcessingJobs);
  const addManualDraftQuestion = useMutation(anyApi.facultyAssignments.addManualDraftQuestion);
  const deleteDraftQuestion = useMutation(anyApi.facultyAssignments.deleteDraftQuestion);
  const updateDraftQuestion = useMutation(anyApi.facultyAssignments.updateDraftQuestion);
  const publishDraftAssignment = useMutation(anyApi.facultyAssignments.publishDraftAssignment);
  const retryDraftJob = useMutation(anyApi.facultyAssignments.retryDraftJob);

  const [step, setStep] = useState<"input" | "processing" | "review">("input");
  const initialAssignmentId = searchParams.get("assignmentId") as Id<"assignments"> | null;
  const classroomIdFromQuery = searchParams.get("classroomId") ?? "";
  const lockClassroom = classroomIdFromQuery.length > 0;
  const [assignmentId, setAssignmentId] = useState<Id<"assignments"> | null>(initialAssignmentId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(90);
  const [allowedLevels, setAllowedLevels] = useState<number[]>([1, 2, 3, 4]);
  const [classroomId, setClassroomId] = useState(classroomIdFromQuery);
  const [inputType, setInputType] = useState<"text" | "pdf">("text");
  const [sourceText, setSourceText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editableQuestions, setEditableQuestions] = useState<DraftQuestion[]>([]);
  const [latestJobs, setLatestJobs] = useState<
    Array<{
      jobId: Id<"facultyAssignmentJobs">;
      assignmentId: Id<"assignments">;
      assignmentTitle: string;
      inputType: "pdf" | "text";
      isPublished: boolean;
      status: "pending" | "processing" | "review_ready" | "completed" | "failed" | "failed_timeout";
      processedQuestions?: number;
      error?: string;
      updatedAt: number;
    }>
  >([]);
  const [dismissedPublishAssignmentId, setDismissedPublishAssignmentId] = useState<string | null>(null);

  const draftStatus = useQuery(
    anyApi.facultyAssignments.getDraftStatus,
    assignmentId ? { assignmentId } : "skip",
  ) as
    | {
        status: "pending" | "processing" | "review_ready" | "completed" | "failed" | "failed_timeout";
        processedQuestions?: number;
        error?: string;
      }
    | null
    | undefined;
  const reviewQuestions = useQuery(
    anyApi.facultyAssignments.getDraftReviewQuestions,
    assignmentId ? { assignmentId } : "skip",
  ) as DraftQuestion[] | undefined;
  const classrooms = useQuery(anyApi.classrooms.getFacultyClassrooms) as
    | Array<{ _id: string; name: string; joinCode: string }>
    | undefined;

  const reviewedCount = useMemo(
    () => editableQuestions.filter((q) => q.reviewed).length,
    [editableQuestions],
  );
  const activePdfJob = latestJobs?.find(
    (job) => job.inputType === "pdf" && !job.isPublished && (job.status === "pending" || job.status === "processing"),
  );
  const readyPublishJob = latestJobs?.find(
    (job) =>
      job.inputType === "pdf" &&
      !job.isPublished &&
      (job.status === "review_ready" || job.status === "completed") &&
      job.assignmentId !== dismissedPublishAssignmentId,
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(DISMISSED_PUBLISH_BANNER_KEY);
    setDismissedPublishAssignmentId(saved && saved.trim() ? saved : null);
  }, []);

  useEffect(() => {
    if (step === "processing" && (draftStatus?.status === "completed" || draftStatus?.status === "review_ready")) {
      setStep("review");
    }
    if (draftStatus?.status === "failed" || draftStatus?.status === "failed_timeout") {
      setStep("processing");
    }
  }, [step, draftStatus?.status]);

  useEffect(() => {
    void sweepMyStaleProcessingJobs({});
  }, [sweepMyStaleProcessingJobs]);

  useEffect(() => {
    let cancelled = false;
    void convex
      .query((anyApi as any).facultyAssignments.getLatestDraftJobs, {})
      .then((rows) => {
        if (!cancelled) {
          setLatestJobs(rows ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLatestJobs([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [convex, anyApi]);

  useEffect(() => {
    if (assignmentId || latestJobs.length === 0) {
      return;
    }
    const candidate = latestJobs.find(
      (job) => job.inputType === "pdf" && !job.isPublished && (job.status === "pending" || job.status === "processing"),
    );
    if (candidate) {
      setAssignmentId(candidate.assignmentId);
      setStep("processing");
    }
  }, [assignmentId, latestJobs]);

  useEffect(() => {
    if (assignmentId) {
      const next = new URLSearchParams();
      next.set("assignmentId", assignmentId as string);
      if (classroomIdFromQuery) {
        next.set("classroomId", classroomIdFromQuery);
      }
      setSearchParams(next);
    }
  }, [assignmentId, setSearchParams, classroomIdFromQuery]);

  useEffect(() => {
    if (initialAssignmentId && step === "input") {
      setStep("processing");
    }
  }, [initialAssignmentId, step]);

  useEffect(() => {
    if (reviewQuestions) {
      setEditableQuestions(reviewQuestions);
    }
  }, [reviewQuestions]);

  const fileToBase64 = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const computeSha256 = async (value: string): Promise<string> => {
    const encoded = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const handleCreate = async () => {
    if (isSubmitting) {
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (allowedLevels.length === 0) {
      toast.error("Select at least one help level");
      return;
    }
    if (!classroomId) {
      toast.error("Please select a classroom");
      return;
    }
    if (inputType === "text" && sourceText.trim().length < 100) {
      toast.error("Please provide at least 100 characters of text");
      return;
    }
    if (inputType === "pdf" && !pdfFile) {
      toast.error("Please upload a PDF");
      return;
    }

    setIsSubmitting(true);
    setIsUploading(true);
    setStep("processing");
    try {
      let sourceHash = "";
      let sourceStorageId: Id<"_storage"> | undefined;
      let pdfBase64: string | undefined;
      if (inputType === "pdf" && pdfFile) {
        pdfBase64 = await fileToBase64(pdfFile);
        sourceHash = await computeSha256(pdfBase64);
        const uploadUrl = await generatePdfUploadUrl({});
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": "application/pdf" },
          body: pdfFile,
        });
        const uploadJson = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
        if (!uploadJson.storageId) {
          throw new Error("PDF upload failed. Please retry.");
        }
        sourceStorageId = uploadJson.storageId;
      } else {
        sourceHash = await computeSha256(sourceText.trim());
      }
      const signature = [
        classroomId,
        title.trim().toLowerCase(),
        inputType,
        sourceHash.slice(0, 24),
      ].join("|");
      const storageKey = `cogait:ai_upload_key:${signature}`;
      const existingKey = window.localStorage.getItem(storageKey);
      const uploadRequestKey = existingKey && existingKey.trim()
        ? existingKey
        : await computeSha256(`upload|${signature}`);
      if (!existingKey) {
        window.localStorage.setItem(storageKey, uploadRequestKey);
      }

      try {
        const draft = await createDraftFromInput({
          title: title.trim() || "Untitled Assignment",
          description: description.trim() || undefined,
          timeLimitMinutes,
          minReasoningChars: 30,
          allowedLevels,
          classroomId: classroomId || undefined,
          inputType,
          sourceText: inputType === "text" ? sourceText : undefined,
          sourceStorageId,
          sourceHash,
          uploadRequestKey,
        });
        setAssignmentId(draft.assignmentId);
        setStep("processing");
        toast.success("Upload accepted. Processing in background.");
      } catch (primaryError) {
        let fallback: { assignmentId: Id<"assignments">; jobId: Id<"facultyAssignmentJobs"> };
        try {
          fallback = await createDraftRecord({
            title: title.trim() || "Untitled Assignment",
            description: description.trim() || undefined,
            timeLimitMinutes,
            minReasoningChars: 30,
            allowedLevels,
            classroomId: classroomId || undefined,
            inputType,
            sourceTextLength: inputType === "text" ? sourceText.trim().length : undefined,
            sourceText: inputType === "text" ? sourceText : undefined,
            sourceStorageId,
            sourceHash,
            uploadRequestKey,
          });
        } catch (fallbackError) {
          const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          const oldValidator =
            message.includes("Object contains extra field `sourceHash`") ||
            message.includes("Object contains extra field `uploadRequestKey`");
          if (!oldValidator) {
            throw fallbackError;
          }
          fallback = await createDraftRecord({
            title: title.trim() || "Untitled Assignment",
            description: description.trim() || undefined,
            timeLimitMinutes,
            minReasoningChars: 30,
            allowedLevels,
            classroomId: classroomId || undefined,
            inputType,
            sourceTextLength: inputType === "text" ? sourceText.trim().length : undefined,
            sourceText: inputType === "text" ? sourceText : undefined,
            sourceStorageId,
          });
        }
        setAssignmentId(fallback.assignmentId);
        const result = await processDirectDraftJob({
          assignmentId: fallback.assignmentId,
          jobId: fallback.jobId,
          inputType,
          sourceText: inputType === "text" ? sourceText : undefined,
          pdfBase64,
        });
        if (result.status !== "completed") {
          throw primaryError;
        }
        setStep("review");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create AI draft";
      toast.error(message);
      setStep("input");
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  const handleRetry = async () => {
    if (!assignmentId) {
      return;
    }
    setIsRetrying(true);
    try {
      await retryDraftJob({ assignmentId });
      toast.success("Retry started. Processing in background.");
      setStep("processing");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Retry failed";
      toast.error(message);
      if (message.toLowerCase().includes("source")) {
        setStep("input");
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const handleUpdateQuestion = async (q: DraftQuestion) => {
    try {
      await updateDraftQuestion({
        questionId: q._id,
        questionText: q.editedText ?? q.questionText,
        questionType: q.questionType,
        mcqOptions: q.mcqOptions,
        correctOption: q.correctOption,
        subject: q.subject,
        topic: q.topic,
        difficulty: q.difficulty,
        structuredRepresentation: q.structuredRepresentation,
        correctAnswer: q.correctAnswer,
        aiAnswer: q.aiAnswer,
        reviewed: Boolean(q.reviewed),
      });
      toast.success(`Question ${q.questionNumber} updated`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update question";
      toast.error(message);
    }
  };

  const handlePublish = async () => {
    if (!assignmentId || editableQuestions.length === 0) {
      return;
    }
    const unreviewed = editableQuestions.length - reviewedCount;
    const acknowledged =
      unreviewed === 0 ||
      window.confirm(
        `${unreviewed} question(s) are unreviewed. Tick acknowledgment and publish anyway?`,
      );
    if (!acknowledged) {
      return;
    }
    setPublishing(true);
    try {
      await publishDraftAssignment({
        assignmentId,
        acknowledgeUnreviewed: acknowledged,
      });
      toast.success("Assignment published");
      navigate("/lecturer/dashboard");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish assignment";
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">AI-Powered Assignment Creation</h1>
        <button
          className="ui-button ui-button-secondary px-4 py-2"
          onClick={() => navigate("/lecturer/dashboard")}
        >
          Back
        </button>
      </div>

      {readyPublishJob && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              navigate(`/lecturer/assignment/${readyPublishJob.assignmentId}/edit`);
            }}
            className="text-green-800 font-medium hover:underline text-left"
          >
            Click here to review and publish
          </button>
          <button
            type="button"
            aria-label="Dismiss publish prompt"
            className="text-green-700 hover:text-green-900"
            onClick={() => {
              const assignmentKey = readyPublishJob.assignmentId as string;
              setDismissedPublishAssignmentId(assignmentKey);
              window.localStorage.setItem(DISMISSED_PUBLISH_BANNER_KEY, assignmentKey);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === "input" && (
        <div className="ui-card p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              className="auth-input-field"
              placeholder="Assignment title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <input
              type="number"
              min={30}
              max={180}
              className="auth-input-field"
              value={timeLimitMinutes}
              onChange={(e) => setTimeLimitMinutes(Number(e.target.value) || 90)}
            />
          </div>

          <select
            className="auth-input-field"
            value={classroomId}
            onChange={(e) => setClassroomId(e.target.value)}
            disabled={lockClassroom}
          >
            <option value="">Select classroom</option>
            {(classrooms ?? []).map((classroom) => (
              <option key={classroom._id} value={classroom._id}>
                {classroom.name} ({classroom.joinCode})
              </option>
            ))}
          </select>

          <textarea
            className="auth-input-field"
            rows={3}
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex gap-2">
            {(["text", "pdf"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setInputType(mode)}
                className={`px-4 py-2 rounded-lg ${
                  inputType === mode ? "bg-blue-500 text-white" : "bg-gray-100"
                }`}
              >
                {mode === "text" ? "Paste Text" : "Upload PDF"}
              </button>
            ))}
          </div>

          {inputType === "text" ? (
            <textarea
              className="auth-input-field"
              rows={10}
              placeholder="Paste assignment text here..."
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
            />
          ) : (
            <div className="space-y-2">
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-gray-500">AI will extract questions from your PDF.</p>
            </div>
          )}

          <div>
            <p className="text-sm mb-2">Allowed help levels</p>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4].map((lvl) => (
                <label key={lvl} className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg">
                  <input
                    type="checkbox"
                    checked={allowedLevels.includes(lvl)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setAllowedLevels((prev) => [...prev, lvl].sort());
                      } else {
                        setAllowedLevels((prev) => prev.filter((x) => x !== lvl));
                      }
                    }}
                  />
                  Level {lvl}
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAllowedLevels([1, 2])}
                className="px-3 py-1 rounded bg-red-100 text-red-700 text-xs"
              >
                Strict (1-2)
              </button>
              <button
                type="button"
                onClick={() => setAllowedLevels([1, 2, 3])}
                className="px-3 py-1 rounded bg-amber-100 text-amber-700 text-xs"
              >
                Balanced (1-3)
              </button>
              <button
                type="button"
                onClick={() => setAllowedLevels([1, 2, 3, 4])}
                className="px-3 py-1 rounded bg-green-100 text-green-700 text-xs"
              >
                All Levels
              </button>
            </div>
          </div>

          <button
            onClick={() => void handleCreate()}
            disabled={
              isSubmitting ||
              isUploading ||
              Boolean(activePdfJob) ||
              draftStatus?.status === "processing" ||
              draftStatus?.status === "pending"
            }
            className="ui-button ui-button-primary px-5 py-2 disabled:opacity-50"
          >
            {isSubmitting ||
            isUploading ||
            Boolean(activePdfJob) ||
            draftStatus?.status === "processing" ||
            draftStatus?.status === "pending" ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                Uploading...
              </span>
            ) : (
              "Create Assignment"
            )}
          </button>
        </div>
      )}

      {step === "processing" && (
        <div className="ui-card p-6">
          <h2 className="text-lg font-medium mb-2">Processing Assignment</h2>
          <p className="text-sm text-gray-600 mb-4">
            Status: {draftStatus?.status ?? "processing"}
          </p>
          {draftStatus === null && (
            <p className="text-amber-700 mb-3">
              No job found for this draft yet. Refresh in a moment or restart processing.
            </p>
          )}
          {draftStatus?.status === "failed" || draftStatus?.status === "failed_timeout" ? (
            <div className="space-y-3">
              <p className="text-red-600">{draftStatus.error ?? "Processing failed"}</p>
              {assignmentId && (
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  disabled={isRetrying}
                  className="px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                >
                  {isRetrying ? "Retrying..." : "Retry Processing"}
                </button>
              )}
            </div>
          ) : draftStatus?.status === "completed" || draftStatus?.status === "review_ready" ? (
            <div className="space-y-2">
              <p className="text-green-700">
                Processing complete. {draftStatus.processedQuestions ?? 0} questions extracted.
              </p>
              <button
                className="ui-button ui-button-primary px-4 py-2"
                onClick={() => navigate(`/lecturer/assignment/${assignmentId}/edit`)}
              >
                Click Here to review and publish
              </button>
            </div>
          ) : (
            <p className="text-gray-700">AI is extracting, classifying, and generating draft answers.</p>
          )}
        </div>
      )}

      {step === "review" && assignmentId && (
        <div className="space-y-4">
          <div className="ui-card p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">Review Questions</p>
              <p className="text-sm text-gray-600">
                Reviewed: {reviewedCount}/{reviewQuestions?.length ?? 0}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void addManualDraftQuestion({ assignmentId })}
                className="ui-button ui-button-secondary px-4 py-2"
              >
                Add Question
              </button>
              <button
                onClick={() => void handlePublish()}
                disabled={publishing}
                className="ui-button ui-button-primary px-4 py-2 disabled:opacity-50"
              >
                {publishing ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>

          {editableQuestions.map((q) => (
            <div key={q._id} className="ui-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Question {q.questionNumber}</p>
                <button
                  className="text-red-600 text-sm"
                  onClick={() => void deleteDraftQuestion({ questionId: q._id })}
                >
                  Delete
                </button>
              </div>

              <textarea
                className="auth-input-field"
                rows={4}
                value={q.editedText ?? q.questionText}
                onChange={(e) => {
                  const updated = editableQuestions.map((item) =>
                    item._id === q._id ? { ...item, editedText: e.target.value } : item,
                  );
                  setEditableQuestions(updated);
                }}
              />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select
                  className="auth-input-field"
                  value={q.questionType ?? "numerical"}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    const updated = editableQuestions.map((item) =>
                      item._id === q._id
                        ? {
                            ...item,
                            questionType: nextType,
                            mcqOptions:
                              nextType === "mcq"
                                ? (item.mcqOptions && item.mcqOptions.length === 4
                                    ? item.mcqOptions
                                    : ["", "", "", ""])
                                : undefined,
                            correctOption: nextType === "mcq" ? item.correctOption : undefined,
                          }
                        : item,
                    );
                    setEditableQuestions(updated);
                  }}
                >
                  <option value="numerical">numerical</option>
                  <option value="mcq">mcq</option>
                  <option value="conceptual">conceptual</option>
                  <option value="manual">manual</option>
                </select>
                <select
                  className="auth-input-field"
                  value={q.subject}
                  onChange={(e) => {
                    const updated = editableQuestions.map((item) =>
                      item._id === q._id ? { ...item, subject: e.target.value as Subject } : item,
                    );
                    setEditableQuestions(updated);
                  }}
                >
                  <option>Physics</option>
                  <option>Chemistry</option>
                  <option>Math</option>
                </select>
                <input
                  className="auth-input-field"
                  value={q.topic}
                  onChange={(e) => {
                    const updated = editableQuestions.map((item) =>
                      item._id === q._id ? { ...item, topic: e.target.value } : item,
                    );
                    setEditableQuestions(updated);
                  }}
                  placeholder="Topic"
                />
                <select
                  className="auth-input-field"
                  value={q.difficulty}
                  onChange={(e) => {
                    const updated = editableQuestions.map((item) =>
                      item._id === q._id ? { ...item, difficulty: e.target.value as Difficulty } : item,
                    );
                    setEditableQuestions(updated);
                  }}
                >
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </div>

              {(q.questionType ?? "").toLowerCase() === "mcq" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {["A", "B", "C", "D"].map((key, idx) => (
                    <input
                      key={`${q._id}-${key}`}
                      className="auth-input-field"
                      value={q.mcqOptions?.[idx] ?? ""}
                      onChange={(e) => {
                        const updated = editableQuestions.map((item) => {
                          if (item._id !== q._id) {
                            return item;
                          }
                          const next = item.mcqOptions && item.mcqOptions.length === 4
                            ? [...item.mcqOptions]
                            : ["", "", "", ""];
                          next[idx] = e.target.value;
                          return { ...item, mcqOptions: next };
                        });
                        setEditableQuestions(updated);
                      }}
                      placeholder={`Option ${key}`}
                    />
                  ))}
                  <select
                    className="auth-input-field"
                    value={q.correctOption ?? ""}
                    onChange={(e) => {
                      const updated = editableQuestions.map((item) =>
                        item._id === q._id
                          ? { ...item, correctOption: (e.target.value || undefined) as DraftQuestion["correctOption"] }
                          : item,
                      );
                      setEditableQuestions(updated);
                    }}
                  >
                    <option value="">Select correct option</option>
                    <option value="A">Correct: A</option>
                    <option value="B">Correct: B</option>
                    <option value="C">Correct: C</option>
                    <option value="D">Correct: D</option>
                  </select>
                </div>
              )}

              <textarea
                className="auth-input-field"
                rows={3}
                value={q.aiAnswer ?? ""}
                onChange={(e) => {
                  const updated = editableQuestions.map((item) =>
                    item._id === q._id ? { ...item, aiAnswer: e.target.value } : item,
                  );
                  setEditableQuestions(updated);
                }}
                placeholder="AI Answer"
              />

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(q.reviewed)}
                  onChange={(e) => {
                    const updated = editableQuestions.map((item) =>
                      item._id === q._id ? { ...item, reviewed: e.target.checked } : item,
                    );
                    setEditableQuestions(updated);
                  }}
                />
                Mark reviewed
              </label>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  Confidence: {q.confidenceLevel ?? "low"} ({Math.round((q.confidenceScore ?? 0) * 100)}%)
                </span>
                <button
                  onClick={() => void handleUpdateQuestion(q)}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
                >
                  Save Question
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


