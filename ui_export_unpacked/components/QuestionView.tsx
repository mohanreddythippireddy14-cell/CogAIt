import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useAction, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { LEVEL_NAMES } from "../../convex/constants";
import { MathRenderer } from "./MathRenderer";
import { ContentBlocksRenderer } from "./ContentBlocksRenderer";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  ArrowRight, 
  ArrowUp,
  Clock, 
  MessageCircle, 
  AlertTriangle,
  Brain,
  HelpCircle,
  Camera,
  Upload,
  X,
  Plus
} from "lucide-react";

interface ChatInteraction {
  _id: Id<"aiInteractions">;
  _creationTime: number;
  attemptId: Id<"attempts">;
  helpLevel: number;
  studentInput: string;
  aiResponse: string;
  tokensUsed?: number;
  responseTimeMs?: number;
  reflectionProvided?: boolean;
  reflectionText?: string;
}

interface McqOption {
  key: "A" | "B" | "C" | "D";
  text: string;
}

function extractMcqOptions(questionText: string): McqOption[] {
  const lines = questionText.split("\n");
  const options: McqOption[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*([A-D])[\)\].:\-]\s*(.+)\s*$/i);
    if (!match) {
      continue;
    }
    const key = match[1].toUpperCase() as McqOption["key"];
    options.push({ key, text: match[2] });
  }
  if (options.length !== 4) {
    return [];
  }
  return options;
}

export function QuestionView() {
  const { assignmentId, questionNumber } = useParams();
  const navigate = useNavigate();
  const parsedQuestionNumber = Number.parseInt(questionNumber ?? "", 10);
  const currentQuestionIndex = Number.isFinite(parsedQuestionNumber) ? parsedQuestionNumber - 1 : -1;
  
  const assignment = useQuery(api.assignments.getAssignmentQuestions, 
    assignmentId ? { assignmentId: assignmentId as Id<"assignments"> } : "skip"
  );
  
  const startAttempt = useMutation(api.attempts.startAttempt);
  const saveAttemptDraft = useMutation(api.attempts.saveAttemptDraft);
  const submitAttempt = useMutation(api.attempts.submitAttempt);
  const storeAgentInteraction = useMutation(api.ai.storeInteraction);
  const updateHelpStats = useMutation(api.attempts.updateHelpStats);
  const convex = useConvex();
  const AGENT_BASE_URL = import.meta.env.VITE_AGENT_URL || 'http://localhost';
  const sendImageFeedback = useAction(api.ai.sendImageFeedback);
  const sendChatMessageAction = useAction(api.ai.sendChatMessage);
  const recordViolation = useMutation(api.attempts.recordViolation);
  const updateHeartbeat = useMutation(api.attempts.updateHeartbeat);
  const autoSubmitAssignment = useMutation(api.attempts.autoSubmitAssignment);
  const updateLiveSnapshot = useMutation((api as any).sessions.updateLiveSnapshot);
  const resumeAssignmentTimer = useMutation(api.attempts.resumeAssignmentTimer);
  const pauseAssignmentTimer = useMutation(api.attempts.pauseAssignmentTimer);
  const studentAssignments = useQuery(api.assignments.getStudentAssignments);
  const assignmentMeta = studentAssignments?.find((item) => item._id === (assignmentId as Id<"assignments">));
  const assignmentProgress = useQuery(
    api.attempts.getAssignmentProgress,
    assignmentId ? { assignmentId: assignmentId as Id<"assignments"> } : "skip",
  );
  const assignmentAttempts = useQuery(
    api.attempts.getAttemptsByAssignment,
    assignmentId ? { assignmentId: assignmentId as Id<"assignments"> } : "skip",
  );
  
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [studentReasoning, setStudentReasoning] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [selectedHelpLevel, setSelectedHelpLevel] = useState<number | null>(null);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatInteraction[]>([]);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isImageSubmitting, setIsImageSubmitting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinalSubmitting, setIsFinalSubmitting] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [violations, setViolations] = useState(0);
  const [questionStatus, setQuestionStatus] = useState<"unattempted" | "answered" | "skipped" | "review">("unattempted");
  const [markedForReview, setMarkedForReview] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentVisible, setConsentVisible] = useState(true);
  
  const chatHistoryQuery = useQuery(
    api.ai.getConversationHistory,
    attemptId ? { attemptId: attemptId as Id<"attempts"> } : "skip"
  );
  const assignmentAllowedLevels = assignmentMeta?.allowedLevels ?? [1, 2, 3, 4];
  
  const answerRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerStyle, setComposerStyle] = useState<CSSProperties>({});
  const [composerHeight, setComposerHeight] = useState(220);
  const initializedQuestionKeyRef = useRef<string | null>(null);
  const ignoreVisibilityUntilRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const lastViolationAtRef = useRef(0);
  const autoSubmittedRef = useRef(false);
  const draftDebounceRef = useRef<number | null>(null);
  const lecturerHints = useQuery(
    (api as any).interventions.getStudentHints,
    assignmentId ? { assignmentId: assignmentId as Id<"assignments"> } : "skip",
  ) as Array<{ _id: Id<"lecturerHints">; message: string; createdAt: number; readAt?: number }> | undefined;
  const markHintRead = useMutation((api as any).interventions.markHintRead);

  // Initialize attempt when component loads
  useEffect(() => {
    if (!consentAccepted || !assignmentId || !assignment || assignment.length === 0) {
      return;
    }
    if (currentQuestionIndex < 0 || currentQuestionIndex >= assignment.length) {
      return;
    }

    const currentQuestion = assignment[currentQuestionIndex];
    if (!currentQuestion) {
      return;
    }

    const key = `${assignmentId}:${currentQuestion._id}:${currentQuestionIndex}`;
    if (initializedQuestionKeyRef.current === key) {
      return;
    }
    initializedQuestionKeyRef.current = key;

    setStudentAnswer("");
    setStudentReasoning("");
    setQuestionStatus("unattempted");
    setMarkedForReview(false);
    setChatInput("");
    setSelectedHelpLevel(null);
    setImageBase64(null);
    setImagePreview(null);
    void initializeAttempt(currentQuestion._id);
  }, [assignmentId, assignment, consentAccepted, currentQuestionIndex]);

  useEffect(() => {
    if (!consentAccepted || !assignmentId) {
      return;
    }
    const key = `cogait_integrity_consent_${assignmentId}`;
    const accepted = window.localStorage.getItem(key) === "1";
    setConsentAccepted(accepted);
    setConsentVisible(!accepted);
  }, [assignmentId]);

  useEffect(() => {
    if (!assignment || !assignmentAttempts) {
      return;
    }
    const currentQuestion = assignment[currentQuestionIndex];
    if (!currentQuestion) {
      return;
    }
    const attempt = assignmentAttempts.find((row) => row.questionId === currentQuestion._id);
    if (!attempt) {
      return;
    }
    setStudentAnswer(attempt.studentAnswer ?? "");
    setStudentReasoning(attempt.studentReasoning ?? "");
    setQuestionStatus((attempt.questionStatus ?? "unattempted") as "unattempted" | "answered" | "skipped" | "review");
    setMarkedForReview(Boolean(attempt.markedForReview));
  }, [assignment, assignmentAttempts, currentQuestionIndex]);

  useEffect(() => {
    if (!assignmentId) {
      return;
    }
    void resumeAssignmentTimer({ assignmentId: assignmentId as Id<"assignments"> });
    return () => {
      void pauseAssignmentTimer({ assignmentId: assignmentId as Id<"assignments"> });
    };
  }, [assignmentId, consentAccepted, pauseAssignmentTimer, resumeAssignmentTimer]);

  useEffect(() => {
    if (assignmentProgress?.submittedAt && assignmentId) {
      navigate(`/student/assignment/${assignmentId}/results`, { replace: true });
    }
  }, [assignmentProgress?.submittedAt, navigate, assignmentId]);

  useEffect(() => {
    if (!assignmentMeta) {
      return;
    }
    const tick = () => {
      const now = Date.now();
      const runningDelta = assignmentProgress?.sessionStartedAt
        ? Math.max(0, now - assignmentProgress.sessionStartedAt)
        : 0;
      const activeMs = (assignmentProgress?.activeTimeMs ?? 0) + runningDelta;
      const remainingSeconds = assignmentMeta.timeLimitMinutes * 60 - Math.floor(activeMs / 1000);
      setTimeLeft(remainingSeconds);
    };
    tick();
    const timerId = setInterval(tick, 1000);
    return () => clearInterval(timerId);
  }, [assignmentMeta, assignmentProgress]);

  // Update chat history when query changes
  useEffect(() => {
    if (chatHistoryQuery) {
      setChatHistory(chatHistoryQuery);
    }
  }, [chatHistoryQuery]);

  useEffect(() => {
    const el = chatMessagesRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    if (chatHistory.length === 0) {
      chatInputRef.current?.focus();
    }
  }, [chatHistory.length]);

  useEffect(() => {
    if (!attemptId) {
      return;
    }
    triggerDebouncedDraftSave();
    return () => {
      if (draftDebounceRef.current) {
        window.clearTimeout(draftDebounceRef.current);
      }
    };
  }, [attemptId, studentAnswer, studentReasoning, questionStatus, markedForReview]);

  useEffect(() => {
    if (!assignmentId) {
      return;
    }
    const currentQuestion = assignment?.[currentQuestionIndex];
    void updateLiveSnapshot({
      assignmentId: assignmentId as Id<"assignments">,
      questionId: currentQuestion?._id,
      state: isChatting ? "using_ai" : studentReasoning.trim().length > 0 ? "thinking" : "solving",
    }).catch(() => {});
  }, [assignment, assignmentId, currentQuestionIndex, isChatting, studentReasoning, updateLiveSnapshot]);

  useEffect(() => {
    for (const hint of lecturerHints ?? []) {
      if (!hint.readAt) {
        void markHintRead({ hintId: hint._id }).catch(() => {});
      }
    }
  }, [lecturerHints, markHintRead]);

  useEffect(() => {
    const updateComposerLayout = () => {
      const panel = chatPanelRef.current;
      const composer = composerRef.current;
      if (!panel) {
        return;
      }
      const rect = panel.getBoundingClientRect();
      const isDesktop = window.innerWidth >= 1024;
      if (isDesktop) {
        setComposerStyle({
          position: "fixed",
          left: Math.round(rect.left + 12),
          width: Math.round(rect.width - 24),
          bottom: "16px",
          zIndex: 30,
        });
      } else {
        setComposerStyle({
          position: "fixed",
          left: "12px",
          right: "12px",
          bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          zIndex: 30,
        });
      }
      if (composer) {
        setComposerHeight(composer.offsetHeight);
      }
    };

    updateComposerLayout();
    window.addEventListener("resize", updateComposerLayout);
    window.addEventListener("scroll", updateComposerLayout, true);
    return () => {
      window.removeEventListener("resize", updateComposerLayout);
      window.removeEventListener("scroll", updateComposerLayout, true);
    };
  }, [imagePreview, showAttachmentMenu, cameraError, chatInput]);

  // Session monitoring
  useEffect(() => {
    if (!consentAccepted) {
      return;
    }
    const handleVisibilityChange = () => {
      const now = Date.now();
      if (now < ignoreVisibilityUntilRef.current || !assignmentId) {
        return;
      }
      if (document.hidden) {
        hiddenAtRef.current = now;
        void pauseAssignmentTimer({ assignmentId: assignmentId as Id<"assignments"> });
        return;
      }
      void resumeAssignmentTimer({ assignmentId: assignmentId as Id<"assignments"> });
      const hiddenForMs = hiddenAtRef.current ? now - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      if (hiddenForMs < 1500 || now - lastViolationAtRef.current < 1500) {
        return;
      }
      lastViolationAtRef.current = now;
      recordViolation({
        assignmentId: assignmentId as Id<"assignments">,
        type: "tabSwitch",
        details: "User switched tabs or minimized window",
      }).then((result) => {
        if (result?.shouldAutoSubmit) {
          toast.error("Too many violations detected. Assignment will be auto-submitted.");
          if (!autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            void autoSubmitWithDraftPreservation();
          }
        } else {
          setViolations(result?.violationCount || 0);
          toast.warning("Tab switch detected. This is being monitored.");
        }
      });
    };

    const handleFullscreenChange = () => {
      if (!assignmentId || !consentAccepted) {
        return;
      }
      if (document.fullscreenElement) {
        return;
      }
      recordViolation({
        assignmentId: assignmentId as Id<"assignments">,
        type: "tabSwitch",
        details: "Fullscreen exited during assessment",
      }).then((result) => {
        setViolations(result?.violationCount || 0);
        toast.warning("Fullscreen exit detected. This is being monitored.");
        if (result?.shouldAutoSubmit && !autoSubmittedRef.current) {
          autoSubmittedRef.current = true;
          void autoSubmitWithDraftPreservation();
        }
      });
    };

    const handleCopyPaste = (e: ClipboardEvent) => {
      if (assignmentId) {
        recordViolation({
          assignmentId: assignmentId as Id<"assignments">,
          type: "copyPaste",
          details: `${e.type} operation detected`,
        }).then((result) => {
          setViolations(result?.violationCount || 0);
          toast.warning("Copy/paste detected. This is being monitored.");
          if (result?.shouldAutoSubmit && !autoSubmittedRef.current) {
            autoSubmittedRef.current = true;
            void autoSubmitWithDraftPreservation();
          }
        });
      }
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ["c", "v", "a", "u"].includes(event.key.toLowerCase())) {
        event.preventDefault();
      }
    };

    // Heartbeat every 30 seconds
    const heartbeatInterval = setInterval(() => {
      if (assignmentId) {
        updateHeartbeat({ assignmentId: assignmentId as Id<"assignments"> });
      }
    }, 30000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("copy", handleCopyPaste);
    document.addEventListener("paste", handleCopyPaste);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("copy", handleCopyPaste);
      document.removeEventListener("paste", handleCopyPaste);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      clearInterval(heartbeatInterval);
    };
  }, [assignmentId, autoSubmitAssignment, consentAccepted, navigate, pauseAssignmentTimer, recordViolation, resumeAssignmentTimer, updateHeartbeat]);

  const initializeAttempt = async (questionId: Id<"questions">) => {
    if (!assignmentId) return;
    try {
      const id = await startAttempt({
        assignmentId: assignmentId as Id<"assignments">,
        questionId,
      });
      setAttemptId(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start attempt";
      toast.error(message);
    }
  };

  const persistCurrentDraft = async (overrideStatus?: "unattempted" | "answered" | "skipped" | "review") => {
    if (!attemptId) {
      return;
    }
    await saveAttemptDraft({
      attemptId: attemptId as Id<"attempts">,
      studentReasoning,
      studentAnswer,
      questionStatus: overrideStatus ?? questionStatus,
      markedForReview,
    });
  };

  const triggerDebouncedDraftSave = () => {
    if (draftDebounceRef.current) {
      window.clearTimeout(draftDebounceRef.current);
    }
    draftDebounceRef.current = window.setTimeout(() => {
      void persistCurrentDraft().catch(() => {});
    }, 15000);
  };

  const autoSubmitWithDraftPreservation = async () => {
    if (!assignmentId) {
      return;
    }
    try {
      await persistCurrentDraft();
    } catch {
      // continue with auto-submit even when local draft save fails
    }
    await autoSubmitAssignment({ assignmentId: assignmentId as Id<"assignments"> });
    navigate(`/student/assignment/${assignmentId}/results`);
  };

  const handleSaveDraft = async () => {
    if (!attemptId) return;
    
    try {
      await persistCurrentDraft();
      toast.success("Draft saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save draft";
      toast.error(message);
    }
  };

  const handleSubmit = async () => {
    if (!attemptId) return;
    const currentQuestion = assignment?.[currentQuestionIndex];
    if (!currentQuestion) {
      toast.error("Invalid question context. Please reload.");
      return;
    }
    
    if (!studentAnswer.trim()) {
      toast.error("Please provide your answer");
      return;
    }

    setIsSubmitting(true);
    try {
      setQuestionStatus("answered");
      setMarkedForReview(false);
      await submitAttempt({
        attemptId: attemptId as Id<"attempts">,
        studentReasoning,
        studentAnswer,
      });
      
      toast.success("Answer submitted successfully!");
      
      // Trigger Agent 2 (Analyst) with REAL session data BEFORE navigating away
      try {
        const realHistory = await convex.query(api.ai.getConversationHistory, { attemptId: attemptId as Id<"attempts"> });
        const sessionLog = (realHistory || []).map((h: any) => ({
          question: currentQuestion?.questionText || '',
          student_input: h.studentInput,
          scaffolding_depth: h.helpLevel,
          timestamp: new Date(h._creationTime).toISOString()
        }));
        // Fire-and-forget to Agent 2 — do NOT await, just dispatch
        fetch(`${AGENT_BASE_URL}:8082/webhook/session_ended`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: attemptId,
            assignment_id: assignmentId,
            session_log: sessionLog,
            proctoring_signals: [{ type: 'tab_switch', severity: violations > 2 ? 3 : 1, timestamp: new Date().toISOString() }]
          })
        }).catch(err => console.error("Agent 2 fire-and-forget failed", err));
      } catch (e) { console.error("Agent 2 session data fetch failed:", e); }

      // Navigate AFTER Agent 2 call is dispatched
      if (currentQuestionIndex < assignment.length - 1) {
        const nextQuestionNumber = currentQuestionIndex + 2;
        navigate(`/student/assignment/${assignmentId}/question/${nextQuestionNumber}`);
      } else {
        navigate(`/student/assignment/${assignmentId}/results`);
      }
      
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit answer";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVoluntarySubmit = async () => {
    if (!assignmentId) {
      return;
    }
    const confirmed = window.confirm(
      "Submit this assignment now? You can review results after submission.",
    );
    if (!confirmed) {
      return;
    }

    setIsFinalSubmitting(true);
    try {
      if (attemptId && studentAnswer.trim()) {
        await persistCurrentDraft("answered");
      }
      await autoSubmitAssignment({ assignmentId: assignmentId as Id<"assignments"> });
      toast.success("Assignment submitted.");
      navigate(`/student/assignment/${assignmentId}/results`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit assignment";
      toast.error(message);
    } finally {
      setIsFinalSubmitting(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !attemptId) {
      return;
    }
    const currentQuestion = assignment?.[currentQuestionIndex];
    if (!currentQuestion) {
      toast.error("Invalid question context. Please reload.");
      return;
    }
    setIsChatting(true);
    try {
      await persistCurrentDraft();
      
      const agentResult = await sendChatMessageAction({
        attemptId: attemptId as Id<"attempts">,
        questionId: currentQuestion._id,
        studentInput: chatInput,
      });

      // NO NEED to call updateHelpStats or storeInteraction manually, 
      // the api.ai.sendChatMessage action handles it internally!
      
      setChatInput("");
      toast.success("CogAIt response received");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get CogAIt response";
      toast.error(message);
    } finally {
      setIsChatting(false);
    }
  };

  const handleComposerSend = async () => {
    if (chatInput.trim()) {
      await sendChatMessage();
      return;
    }

    if (imageBase64) {
      await handleSendImage(1); // Default to 1 for images for now
    }
  };

  const closeCamera = () => {
    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) {
        track.stop();
      }
      cameraStreamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const openCamera = async () => {
    try {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API unavailable in this browser/context.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      cameraStreamRef.current = stream;
      setIsCameraOpen(true);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        void cameraVideoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraError("Unable to access camera. Use Upload instead.");
      fileInputRef.current?.click();
    }
  };

  const captureFromCamera = async () => {
    const video = cameraVideoRef.current;
    if (!video) {
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      toast.error("Camera is not ready. Please wait a moment and retry.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setImagePreview(dataUrl);
    setImageBase64(dataUrl.split(",")[1] ?? dataUrl);
    closeCamera();
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const getImageResolution = (file: File): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const imageUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(imageUrl);
      };
      img.onerror = reject;
      img.src = imageUrl;
    });

  const handleImageSelected = async (file: File | null) => {
    ignoreVisibilityUntilRef.current = Date.now() + 3000;
    if (!file) {
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image too large. Maximum size is 5MB.");
      return;
    }
    try {
      const { width, height } = await getImageResolution(file);
      if (width < 300 || height < 300) {
        toast.error("Image resolution too low. Minimum is 300x300.");
        return;
      }

      const dataUrl = await readFileAsDataUrl(file);
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1] ?? dataUrl);
    } catch {
      toast.error("Failed to load selected image.");
    }
  };

  const handleSendImage = async (helpLevel: number) => {
    if (!attemptId || !imageBase64) {
      return;
    }
    const currentQuestion = assignment?.[currentQuestionIndex];
    if (!currentQuestion) {
      toast.error("Invalid question context. Please reload.");
      return;
    }
    setIsImageSubmitting(true);
    try {
      await persistCurrentDraft();
      await sendImageFeedback({
        attemptId: attemptId as Id<"attempts">,
        questionId: currentQuestion._id,
        question_text: currentQuestion.questionText,
        mode: "THINKING",
        help_level: helpLevel,
        image_base64: imageBase64,
        system_prompt_version: "v4",
      });
      setImageBase64(null);
      setImagePreview(null);
      toast.success("Image feedback received");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to analyze image";
      toast.error(message);
    } finally {
      setIsImageSubmitting(false);
    }
  };

  if (!assignmentId) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid assignment route</h2>
        <button
          onClick={() => navigate("/student/dashboard")}
          className="ui-button ui-button-primary px-4 py-2"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!Number.isFinite(parsedQuestionNumber) || parsedQuestionNumber < 1) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid question number</h2>
        <p className="text-gray-600 mb-4">The requested question is not valid.</p>
        <button
          onClick={() => navigate(`/student/assignment/${assignmentId}/question/1`)}
          className="ui-button ui-button-primary px-4 py-2"
        >
          Go to Question 1
        </button>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (assignment.length === 0) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">No questions found</h2>
        <p className="text-gray-600">This assignment doesn't have any questions yet.</p>
      </div>
    );
  }

  if (currentQuestionIndex < 0 || currentQuestionIndex >= assignment.length) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid question number</h2>
        <p className="text-gray-600 mb-4">
          Question {parsedQuestionNumber} does not exist in this assignment.
        </p>
        <button
          onClick={() => navigate(`/student/assignment/${assignmentId}/question/1`)}
          className="ui-button ui-button-primary px-4 py-2"
        >
          Go to Question 1
        </button>
      </div>
    );
  }

  const currentQuestion = assignment[currentQuestionIndex];
  const currentQuestionAny = currentQuestion as typeof currentQuestion & {
    questionType?: string;
    mcqOptions?: string[];
  };
  if (!currentQuestion) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Question unavailable</h2>
        <p className="text-gray-600 mb-4">Unable to load this question.</p>
        <button
          onClick={() => navigate(`/student/assignment/${assignmentId}/question/1`)}
          className="ui-button ui-button-primary px-4 py-2"
        >
          Go to Question 1
        </button>
      </div>
    );
  }
  const structuredMcqOptions = Array.isArray(currentQuestionAny.mcqOptions) && currentQuestionAny.mcqOptions.length === 4
    ? currentQuestionAny.mcqOptions.map((text, idx) => ({
        key: (["A", "B", "C", "D"][idx] as McqOption["key"]),
        text,
      }))
    : [];
  const fallbackMcqOptions = extractMcqOptions(currentQuestion.questionText);
  const mcqOptions = structuredMcqOptions.length === 4 ? structuredMcqOptions : fallbackMcqOptions;
  const isMcqQuestion =
    (currentQuestionAny.questionType ?? "").toLowerCase() === "mcq"
      ? mcqOptions.length === 4
      : mcqOptions.length === 4;
  const mergedChatHistory = chatHistory
    .map((item) => ({
      id: String(item._id),
      _creationTime: item._creationTime,
      studentInput: item.studentInput,
      aiResponse: item.aiResponse,
      helpLevel: item.helpLevel,
    }))
    .sort((a, b) => a._creationTime - b._creationTime);

  const helpLevels = [
    { level: 1, name: "Audit Mode", color: "bg-blue-100 text-blue-800" },
    { level: 2, name: "Socratic Mode", color: "bg-green-100 text-green-800" },
    { level: 3, name: "Instruction Mode", color: "bg-orange-100 text-orange-800" },
    { level: 4, name: "Deep Assistance", color: "bg-red-100 text-red-800" },
  ];

  const currentDynamicHelpLevel = mergedChatHistory.length > 0 ? mergedChatHistory[mergedChatHistory.length - 1].helpLevel : 1;
  const currentLevelInfo = helpLevels.find(h => h.level === currentDynamicHelpLevel) || helpLevels[0];

  const statusByQuestionNumber = new Map<number, "unattempted" | "answered" | "skipped" | "review">();
  for (const question of assignment) {
    statusByQuestionNumber.set(question.questionNumber, "unattempted");
  }
  for (const attempt of assignmentAttempts ?? []) {
    const question = assignment.find((item) => item._id === attempt.questionId);
    if (!question) {
      continue;
    }
    statusByQuestionNumber.set(
      question.questionNumber,
      (attempt.questionStatus ?? ((attempt.studentAnswer ?? "").trim().length > 0 ? "answered" : "unattempted")) as
        "unattempted" | "answered" | "skipped" | "review",
    );
  }
  statusByQuestionNumber.set(currentQuestion.questionNumber, questionStatus);

  const statusCounts = Array.from(statusByQuestionNumber.values()).reduce(
    (acc, status) => {
      if (status === "answered") {
        acc.answered += 1;
      } else if (status === "skipped") {
        acc.skipped += 1;
      } else if (status === "review") {
        acc.review += 1;
      } else {
        acc.unattempted += 1;
      }
      return acc;
    },
    { answered: 0, skipped: 0, review: 0, unattempted: 0 },
  );

  return (
    <div className="min-h-screen">
      {consentVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg ui-modal p-6">
            <h2 className="text-xl font-semibold text-white">Assessment Integrity Consent</h2>
            <p className="mt-2 text-sm text-white/50">
              This assessment monitors tab visibility, fullscreen exits, and copy/paste attempts.
              Excessive violations can auto-submit your assignment.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-white/60 hover:bg-[rgba(255,255,255,0.06)]"
                onClick={() => navigate("/student/dashboard")}
              >
                Exit
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm text-white hover:bg-[var(--color-primary-hover)] shadow-[0_8px_20px_rgba(72,32,220,0.35)]"
                onClick={async () => {
                  if (!assignmentId) {
                    return;
                  }
                  try {
                    await document.documentElement.requestFullscreen();
                  } catch {
                    // continue even if fullscreen is blocked by browser policy
                  }
                  window.localStorage.setItem(`cogait_integrity_consent_${assignmentId}`, "1");
                  setConsentAccepted(true);
                  setConsentVisible(false);
                }}
              >
                I Agree and Start
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="app-shell-header px-6 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/student/dashboard")}
              className="text-white/40 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Question {currentQuestionIndex + 1} of {assignment.length}</h1>
              <p className="text-sm text-white/40">{currentQuestion.subject} - {currentQuestion.topic}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            {violations > 0 && (
              <div className="app-pill bg-[rgba(239,68,68,0.15)] text-red-400 border-[rgba(239,68,68,0.3)] mt-1">
                <AlertTriangle className="h-4 w-4 mr-1" />
                <span className="text-sm">{violations} violations</span>
              </div>
            )}

            <div className="flex flex-col items-end gap-2">
              <div
                className={`app-pill flex items-center backdrop-blur-sm ${
                  timeLeft < 0 ? "bg-[rgba(239,68,68,0.15)] text-red-400 border-[rgba(239,68,68,0.3)]" : "bg-[rgba(255,255,255,0.06)] text-white/70"
                }`}
              >
                <Clock className="h-4 w-4 mr-1" />
                <span className="text-sm">
                  {timeLeft < 0 ? "Extra time: +" : "Time remaining: "}
                  {Math.floor(Math.abs(timeLeft) / 60)}:{(Math.abs(timeLeft) % 60).toString().padStart(2, "0")}
                </span>
              </div>
              <button
                onClick={() => void handleVoluntarySubmit()}
                disabled={isFinalSubmitting}
                className="px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-all shadow-[0_8px_20px_rgba(220,40,120,0.35)]"
              >
                {isFinalSubmitting ? "Submitting..." : "Submit Assignment"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid h-[calc(100vh-64px)] grid-cols-1 grid-rows-[minmax(0,42vh)_minmax(0,58vh)] gap-3 p-3 lg:grid-cols-[45%_55%] lg:grid-rows-1">
        {/* Main Content */}
        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="mx-auto max-w-4xl space-y-4">
            {/* Question */}
            <div className="spatial-widget p-4 spatial-enter spatial-stagger-1">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-5 w-5 text-[var(--color-primary-solid)]" />
                <h2 className="text-lg font-semibold text-white">Question</h2>
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                  currentQuestion.difficulty === 'easy' ? 'bg-[rgba(16,185,129,0.15)] text-emerald-400 border-[rgba(16,185,129,0.3)]' :
                  currentQuestion.difficulty === 'medium' ? 'bg-[rgba(245,158,11,0.15)] text-amber-400 border-[rgba(245,158,11,0.3)]' :
                  'bg-[rgba(239,68,68,0.15)] text-red-400 border-[rgba(239,68,68,0.3)]'
                }`}>
                  {currentQuestion.difficulty}
                </span>
              </div>
              
              <div className="prose prose-invert max-w-none">
                <ContentBlocksRenderer
                  className="text-white/90 whitespace-pre-wrap"
                  contentBlocks={(currentQuestion as any).contentBlocks}
                  fallbackText={currentQuestion.questionText}
                />
                
                {currentQuestion.givenVariables && (
                  <div className="mt-4 p-4 rounded-xl bg-[rgba(72,32,220,0.1)] border border-[rgba(72,32,220,0.25)]">
                    <h4 className="font-medium text-[var(--color-primary-solid)] mb-2">Given:</h4>
                    <MathRenderer className="text-white/80 whitespace-pre-wrap" text={currentQuestion.givenVariables} />
                  </div>
                )}
                
                {currentQuestion.imageUrl && (
                  <div className="mt-4">
                    <img 
                      src={currentQuestion.imageUrl} 
                      alt="Question diagram"
                      className="max-w-full h-auto rounded-xl border border-[var(--color-border)]"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Student Response */}
            <div className="spatial-widget p-4 spatial-enter spatial-stagger-2">
              <h3 className="text-base font-semibold mb-3 text-white">Your Response</h3>
              
              <div className="space-y-4">


                <div>
                  <label className="block text-sm font-medium text-white/60 mb-2">
                    Final Answer *
                  </label>
                  {isMcqQuestion ? (
                    <div className="space-y-2">
                      {mcqOptions.map((option) => (
                        <label
                          key={option.key}
                          className={`flex items-start gap-3 p-3 border rounded-xl cursor-pointer transition-all backdrop-blur-sm ${
                            studentAnswer === option.key
                              ? "border-[rgba(72,32,220,0.5)] bg-[rgba(72,32,220,0.15)]"
                              : "border-[var(--color-border)] hover:bg-[rgba(255,255,255,0.04)] hover:border-[var(--color-border-strong)]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="mcq-answer"
                            className="mt-1 accent-[var(--color-primary-solid)]"
                            checked={studentAnswer === option.key}
                            onChange={() => setStudentAnswer(option.key)}
                          />
                          <div className="text-sm text-white/80">
                            <span className="font-semibold mr-2">{option.key}.</span>
                            {option.text}
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      ref={answerRef}
                      className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.04)] text-white focus:border-[var(--color-primary-solid)] focus:ring-1 focus:ring-[rgba(72,32,220,0.4)] outline-none backdrop-blur-sm"
                      value={studentAnswer}
                      onChange={(e) => setStudentAnswer(e.target.value)}
                      placeholder="Enter your final numerical answer"
                    />
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuestionStatus("review");
                    setMarkedForReview(true);
                    void persistCurrentDraft("review");
                  }}
                  className={`px-3 py-2 rounded-xl text-sm border transition-all ${markedForReview ? "bg-[rgba(139,92,246,0.15)] text-violet-400 border-[rgba(139,92,246,0.3)]" : "bg-[rgba(255,255,255,0.04)] text-white/60 border-[var(--color-border)] hover:bg-[rgba(255,255,255,0.08)]"}`}
                >
                  Mark for Review
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuestionStatus("skipped");
                    setMarkedForReview(false);
                    void persistCurrentDraft("skipped");
                  }}
                  className={`px-3 py-2 rounded-xl text-sm border transition-all ${questionStatus === "skipped" ? "bg-[rgba(239,68,68,0.15)] text-red-400 border-[rgba(239,68,68,0.3)]" : "bg-[rgba(255,255,255,0.04)] text-white/60 border-[var(--color-border)] hover:bg-[rgba(255,255,255,0.08)]"}`}
                >
                  Mark as Skipped
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuestionStatus("answered");
                    setMarkedForReview(false);
                    void persistCurrentDraft("answered");
                  }}
                  className={`px-3 py-2 rounded-xl text-sm border transition-all ${questionStatus === "answered" ? "bg-[rgba(16,185,129,0.15)] text-emerald-400 border-[rgba(16,185,129,0.3)]" : "bg-[rgba(255,255,255,0.04)] text-white/60 border-[var(--color-border)] hover:bg-[rgba(255,255,255,0.08)]"}`}
                >
                  Mark as Answered
                </button>
              </div>

              <div className="flex justify-between mt-3">
                <button
                  onClick={handleSaveDraft}
                  className="px-4 py-2 bg-[rgba(255,255,255,0.06)] text-white/60 rounded-xl hover:bg-[rgba(255,255,255,0.1)] transition-all border border-[var(--color-border)]"
                >
                  Save Draft
                </button>
                
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !studentAnswer.trim()}
                  className="px-6 py-2 bg-[var(--color-primary)] text-white rounded-xl hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_20px_rgba(72,32,220,0.35)]"
                >
                  {isSubmitting ? "Submitting..." : "Submit Answer"}
                </button>
              </div>
            </div>

            {/* Navigation */}
            <div className="space-y-3">
              <div className="text-sm text-white/40">
                {statusCounts.answered} Answered | {statusCounts.skipped} Skipped | {statusCounts.review} Marked | {statusCounts.unattempted} Remaining
              </div>
              <div className="grid grid-cols-8 md:grid-cols-10 gap-2">
                {assignment.map((question, idx) => {
                  const status = statusByQuestionNumber.get(question.questionNumber) ?? "unattempted";
                  const isCurrent = idx === currentQuestionIndex;
                  const tone =
                    status === "answered"
                      ? "bg-[rgba(16,185,129,0.15)] text-emerald-400 border-[rgba(16,185,129,0.3)]"
                      : status === "skipped"
                        ? "bg-[rgba(239,68,68,0.15)] text-red-400 border-[rgba(239,68,68,0.3)]"
                        : status === "review"
                          ? "bg-[rgba(139,92,246,0.15)] text-violet-400 border-[rgba(139,92,246,0.3)]"
                          : "bg-[rgba(255,255,255,0.04)] text-white/50 border-[var(--color-border)]";
                  return (
                    <button
                      key={question._id}
                      type="button"
                      className={`h-9 rounded-lg border text-xs font-medium ${tone} ${isCurrent ? "ring-2 ring-[var(--color-primary-solid)]" : ""} transition-all`}
                      onClick={() => {
                        void persistCurrentDraft();
                        navigate(`/student/assignment/${assignmentId}/question/${idx + 1}`);
                      }}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => {
                    if (currentQuestionIndex > 0) {
                      const prevQuestionNumber = currentQuestionIndex;
                      void persistCurrentDraft();
                      navigate(`/student/assignment/${assignmentId}/question/${prevQuestionNumber}`);
                    }
                  }}
                disabled={currentQuestionIndex === 0}
                className="inline-flex items-center px-4 py-2 bg-[rgba(255,255,255,0.06)] text-white/60 rounded-xl hover:bg-[rgba(255,255,255,0.1)] transition-all disabled:opacity-50 border border-[var(--color-border)]"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </button>
              
                <button
                  onClick={() => {
                    if (currentQuestionIndex < assignment.length - 1) {
                      const nextQuestionNumber = currentQuestionIndex + 2;
                      void persistCurrentDraft();
                      navigate(`/student/assignment/${assignmentId}/question/${nextQuestionNumber}`);
                    }
                  }}
                disabled={currentQuestionIndex === assignment.length - 1}
                className="inline-flex items-center px-4 py-2 bg-[var(--color-primary)] text-white rounded-xl hover:bg-[var(--color-primary-hover)] transition-all disabled:opacity-50 shadow-[0_8px_20px_rgba(72,32,220,0.35)]"
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Chat Sidebar */}
        <div ref={chatPanelRef} className="relative min-h-0 spatial-widget widget-purple rounded-[16px] flex flex-col overflow-hidden spatial-enter spatial-stagger-3">
          <div className="p-4 border-b border-[rgba(72,32,220,0.25)]">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="h-5 w-5 text-[var(--color-primary-solid)]" />
              <h3 className="font-semibold text-white">CogAIt</h3>
            </div>
            {(lecturerHints ?? []).length > 0 && (
              <div className="mb-3 space-y-2">
                {(lecturerHints ?? []).slice(-2).map((hint) => (
                  <div key={hint._id} className="rounded-xl border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.1)] px-3 py-2 text-xs text-white/80 backdrop-blur-sm">
                    <div className="font-semibold mb-1 text-violet-400">Your Lecturer</div>
                    <div>{hint.message}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between rounded-xl bg-[rgba(255,255,255,0.04)] border border-[var(--color-border)] px-3 py-2 text-xs">
              <span className="flex items-center gap-2 text-white/50">
                <span>Current State:</span>
                <span className={`px-2 py-0.5 rounded-full font-medium border ${
                  currentLevelInfo.level === 1 ? 'bg-[rgba(72,32,220,0.15)] text-[var(--color-primary-solid)] border-[rgba(72,32,220,0.3)]' :
                  currentLevelInfo.level === 2 ? 'bg-[rgba(16,185,129,0.15)] text-emerald-400 border-[rgba(16,185,129,0.3)]' :
                  currentLevelInfo.level === 3 ? 'bg-[rgba(245,158,11,0.15)] text-amber-400 border-[rgba(245,158,11,0.3)]' :
                  'bg-[rgba(239,68,68,0.15)] text-red-400 border-[rgba(239,68,68,0.3)]'
                }`}>
                  {currentLevelInfo.name}
                </span>
              </span>
            </div>
          </div>

          {/* Chat History */}
          <div
            ref={chatMessagesRef}
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
            style={{ paddingBottom: composerHeight + 24 }}
          >
            {mergedChatHistory.length === 0 ? (
              <div className="text-center text-white/30 mt-8">
                <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No CogAIt interactions yet</p>
                <p className="text-xs">Ask anything about this question to get started</p>
              </div>
            ) : (
              mergedChatHistory.map((interaction) => (
                <div key={interaction.id} className="space-y-3">
                  <div className="bg-[rgba(72,32,220,0.15)] border border-[rgba(72,32,220,0.25)] rounded-xl p-3 backdrop-blur-sm">
                    <div className="text-xs text-[var(--color-primary-solid)] font-medium mb-1">
                      {`You (${LEVEL_NAMES[interaction.helpLevel as keyof typeof LEVEL_NAMES]})`}
                    </div>
                    <p className="text-sm text-white/80">{interaction.studentInput}</p>
                  </div>
                  
                  <div className="bg-[rgba(255,255,255,0.04)] border border-[var(--color-border)] rounded-xl p-3 backdrop-blur-sm">
                    <div className="text-xs text-white/40 font-medium mb-1">CogAIt</div>
                    <MathRenderer className="text-sm text-white/80 whitespace-pre-wrap" text={interaction.aiResponse} />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Chat Input */}
          <div ref={composerRef} className="z-20" style={composerStyle}>
            <div className="space-y-3 spatial-widget p-3">
              {imagePreview && (
                <div className="relative rounded-xl border border-[var(--color-border)] p-2">
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="w-full h-24 object-cover rounded-lg"
                  />
                  <button
                    className="absolute top-3 right-3 bg-[rgba(10,10,15,0.9)] rounded-full p-1 shadow-sm border border-[var(--color-border)]"
                    onClick={() => {
                      setImagePreview(null);
                      setImageBase64(null);
                    }}
                  >
                    <X className="h-4 w-4 text-white" />
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.04)] p-2">
                <div className="flex items-end gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowAttachmentMenu((prev) => !prev)}
                      disabled={isImageSubmitting || isChatting}
                      className="h-9 w-9 rounded-full bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.12)] inline-flex items-center justify-center disabled:opacity-50 text-white/60 border border-[var(--color-border)] transition-all"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {showAttachmentMenu && (
                      <div className="absolute bottom-11 left-0 spatial-widget p-1 z-20 w-36">
                        <button
                          onClick={() => {
                            setShowAttachmentMenu(false);
                            ignoreVisibilityUntilRef.current = Date.now() + 3000;
                            void openCamera();
                          }}
                          className="w-full text-left px-2 py-2 rounded-lg hover:bg-[rgba(255,255,255,0.06)] text-sm inline-flex items-center text-white/70"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Camera
                        </button>
                        <button
                          onClick={() => {
                            setShowAttachmentMenu(false);
                            ignoreVisibilityUntilRef.current = Date.now() + 3000;
                            fileInputRef.current?.click();
                          }}
                          className="w-full text-left px-2 py-2 rounded-lg hover:bg-[rgba(255,255,255,0.06)] text-sm inline-flex items-center text-white/70"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </button>
                      </div>
                    )}
                  </div>

                  <textarea
                    ref={chatInputRef}
                    className="flex-1 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-transparent text-white focus:border-[var(--color-primary-solid)] focus:ring-1 focus:ring-[rgba(72,32,220,0.4)] outline-none text-sm resize-none placeholder:text-white/30"
                    rows={2}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !(e.nativeEvent as KeyboardEvent).isComposing
                      ) {
                        e.preventDefault();
                        void handleComposerSend();
                      }
                    }}
                    placeholder="Message CogAIt..."
                  />

                  <button
                    onClick={() => void handleComposerSend()}
                    disabled={isChatting || isImageSubmitting || (!chatInput.trim() && !imageBase64)}
                    className="h-9 w-9 rounded-full bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_12px_rgba(72,32,220,0.3)]"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void handleImageSelected(e.target.files?.[0] ?? null)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleImageSelected(e.target.files?.[0] ?? null)}
              />

              {cameraError && <p className="text-xs text-red-400">{cameraError}</p>}
            </div>
          </div>
        </div>
      </div>

      {isCameraOpen && (
        <div className="ui-modal-backdrop z-50">
          <div className="ui-modal max-w-md space-y-3">
            <video
              ref={cameraVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full rounded-lg bg-black"
            />
            <div className="flex justify-between">
              <button
                onClick={closeCamera}
                className="ui-button ui-button-secondary px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={() => void captureFromCamera()}
                className="ui-button ui-button-primary px-4 py-2"
              >
                Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}