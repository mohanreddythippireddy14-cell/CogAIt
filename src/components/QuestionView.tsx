import { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
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

interface GateFeedbackMessage {
  id: string;
  _creationTime: number;
  aiResponse: string;
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
  const chatWithAI = useAction(api.ai.sendChatMessage);
  const validateReasoningForUnlock = useAction((api as any).ai.validateReasoningForUnlock);
  const sendImageFeedback = useAction(api.ai.sendImageFeedback);
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
  const [showModeSelection, setShowModeSelection] = useState(false);
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
  const [isReasoningValidationRunning, setIsReasoningValidationRunning] = useState(false);
  const [reasoningValidated, setReasoningValidated] = useState(false);
  const [reasoningValidationScore, setReasoningValidationScore] = useState<number | null>(null);
  const [gateFeedbackMessages, setGateFeedbackMessages] = useState<GateFeedbackMessage[]>([]);
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
    setShowModeSelection(false);
    setImageBase64(null);
    setImagePreview(null);
    setReasoningValidated(false);
    setReasoningValidationScore(null);
    setGateFeedbackMessages([]);
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
    if (chatHistory.length === 0 && gateFeedbackMessages.length === 0) {
      chatInputRef.current?.focus();
    }
  }, [chatHistory.length, gateFeedbackMessages.length]);

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
    setReasoningValidated(false);
    setReasoningValidationScore(null);
  }, [studentReasoning, attemptId]);

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
      
      // Move to next question or results
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

  const validateReasoningGate = async () => {
    if (!attemptId) {
      return;
    }
    const currentQuestion = assignment?.[currentQuestionIndex];
    if (!currentQuestion) {
      toast.error("Invalid question context. Please reload.");
      return;
    }
    const reasoningText = studentReasoning.trim();
    if (!reasoningText) {
      const feedback = "Your reasoning is not related to the question yet. Add your concept and planned steps first.";
      setGateFeedbackMessages((prev) => [
        ...prev,
        { id: `gate_${Date.now()}`, _creationTime: Date.now(), aiResponse: feedback },
      ]);
      toast.error("Write reasoning before AI can be unlocked.");
      return;
    }
    setIsReasoningValidationRunning(true);
    try {
      await persistCurrentDraft();
      const result = await validateReasoningForUnlock({
        attemptId: attemptId as Id<"attempts">,
        questionId: currentQuestion._id,
        reasoningText,
      });
      setReasoningValidationScore(result.relevanceScore);
      setReasoningValidated(result.valid);
      if (result.valid) {
        toast.success(`AI unlocked (reasoning relevance: ${result.relevanceScore}%)`);
        return;
      }
      setGateFeedbackMessages((prev) => [
        ...prev,
        { id: `gate_${Date.now()}`, _creationTime: Date.now(), aiResponse: result.feedback },
      ]);
      toast.error(`AI locked. Reasoning relevance is ${result.relevanceScore}%. Minimum is 50%.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to validate reasoning";
      toast.error(message);
    } finally {
      setIsReasoningValidationRunning(false);
    }
  };

  const sendChatMessage = async (helpLevel: number) => {
    if (!chatInput.trim() || !attemptId) {
      return;
    }
    if (!aiUnlocked) {
      toast.error("AI is locked. Validate your reasoning first.");
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
      await chatWithAI({
        attemptId: attemptId as Id<"attempts">,
        questionId: currentQuestion._id,
        studentInput: chatInput,
        helpLevel,
      });
      
      setChatInput("");
      toast.success("CogAIt response received");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to get CogAIt response";
      toast.error(message);
    } finally {
      setIsChatting(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!chatInput.trim() || !attemptId) {
      return;
    }
    if (selectedHelpLevel === null) {
      setShowModeSelection(true);
      return;
    }
    await sendChatMessage(selectedHelpLevel);
  };

  const handleComposerSend = async (overrideHelpLevel?: number) => {
    if (!aiUnlocked) {
      toast.error("AI is locked until reasoning is validated at 50% relevance.");
      return;
    }
    if (selectedHelpLevel === null && overrideHelpLevel === undefined) {
      setShowModeSelection(true);
      return;
    }
    const effectiveHelpLevel = overrideHelpLevel ?? selectedHelpLevel;
    if (!effectiveHelpLevel) {
      setShowModeSelection(true);
      return;
    }
    if (selectedHelpLevel === null && overrideHelpLevel !== undefined) {
      setSelectedHelpLevel(overrideHelpLevel);
    }

    if (chatInput.trim()) {
      await sendChatMessage(effectiveHelpLevel);
      return;
    }

    if (imageBase64) {
      await handleSendImage(effectiveHelpLevel);
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
    if (!aiUnlocked) {
      toast.error("AI is locked. Validate your reasoning first.");
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
  const currentReasoningChars = studentReasoning.trim().length;
  const currentAttempt = (assignmentAttempts ?? []).find((row) => row.questionId === currentQuestion._id);
  const alreadyUsedAi = (currentAttempt?.totalHelpRequests ?? 0) > 0;
  const aiUnlocked = alreadyUsedAi || reasoningValidated;
  const mergedChatHistory = [
    ...chatHistory.map((item) => ({
      id: String(item._id),
      _creationTime: item._creationTime,
      studentInput: item.studentInput,
      aiResponse: item.aiResponse,
      helpLevel: item.helpLevel,
      gateFeedback: false,
    })),
    ...gateFeedbackMessages.map((item) => ({
      id: item.id,
      _creationTime: item._creationTime,
      studentInput: "Reasoning validation",
      aiResponse: item.aiResponse,
      helpLevel: 1,
      gateFeedback: true,
    })),
  ].sort((a, b) => a._creationTime - b._creationTime);
  const helpLevels = [
    { level: 1, name: "Audit Mode", desc: "Logic verification only", color: "bg-blue-100 text-blue-800" },
    { level: 2, name: "Socratic Mode", desc: "Guiding questions", color: "bg-green-100 text-green-800" },
    { level: 3, name: "Instruction Mode", desc: "Approach & formulas", color: "bg-orange-100 text-orange-800" },
    { level: 4, name: "Deep Assistance", desc: "Step-by-step guidance", color: "bg-red-100 text-red-800" },
  ];

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-semibold text-gray-900">Assessment Integrity Consent</h2>
            <p className="mt-2 text-sm text-gray-600">
              This assessment monitors tab visibility, fullscreen exits, and copy/paste attempts.
              Excessive violations can auto-submit your assignment.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => navigate("/student/dashboard")}
              >
                Exit
              </button>
              <button
                type="button"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
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
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold">Question {currentQuestionIndex + 1} of {assignment.length}</h1>
              <p className="text-sm text-gray-600">{currentQuestion.subject} - {currentQuestion.topic}</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            {violations > 0 && (
              <div className="app-pill bg-red-100 text-red-700 mt-1">
                <AlertTriangle className="h-4 w-4 mr-1" />
                <span className="text-sm">{violations} violations</span>
              </div>
            )}

            <div className="flex flex-col items-end gap-2">
              <div
                className={`app-pill flex items-center ${
                  timeLeft < 0 ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
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
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
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
            <div className="app-surface-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-5 w-5 text-blue-500" />
                <h2 className="text-lg font-semibold">Question</h2>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  currentQuestion.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
                  currentQuestion.difficulty === 'medium' ? 'bg-orange-100 text-orange-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {currentQuestion.difficulty}
                </span>
              </div>
              
              <div className="prose max-w-none">
                <ContentBlocksRenderer
                  className="text-gray-900 whitespace-pre-wrap"
                  contentBlocks={(currentQuestion as any).contentBlocks}
                  fallbackText={currentQuestion.questionText}
                />
                
                {currentQuestion.givenVariables && (
                  <div className="mt-4 p-4 rounded-lg bg-sky-50 border border-sky-100">
                    <h4 className="font-medium text-blue-900 mb-2">Given:</h4>
                    <MathRenderer className="text-blue-800 whitespace-pre-wrap" text={currentQuestion.givenVariables} />
                  </div>
                )}
                
                {currentQuestion.imageUrl && (
                  <div className="mt-4">
                    <img 
                      src={currentQuestion.imageUrl} 
                      alt="Question diagram"
                      className="max-w-full h-auto rounded-lg border"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Student Response */}
            <div className="app-surface-card p-4">
              <h3 className="text-base font-semibold mb-3">Your Response</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reasoning Workspace (required before AI)
                  </label>
                  <textarea
                    className="w-full min-h-28 px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                    value={studentReasoning}
                    onChange={(e) => setStudentReasoning(e.target.value)}
                    placeholder="Write your approach first. What concept applies? What are you unsure about?"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void validateReasoningGate()}
                      disabled={isReasoningValidationRunning || !studentReasoning.trim()}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isReasoningValidationRunning ? "Validating..." : "Validate reasoning for AI"}
                    </button>
                    <p className={`text-xs ${aiUnlocked ? "text-green-700" : "text-amber-700"}`}>
                      {aiUnlocked
                        ? `AI unlocked${reasoningValidationScore !== null ? ` (${reasoningValidationScore}% relevance)` : ""}`
                        : `AI locked until reasoning relevance is 50% or higher`}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Final Answer *
                  </label>
                  {isMcqQuestion ? (
                    <div className="space-y-2">
                      {mcqOptions.map((option) => (
                        <label
                          key={option.key}
                          className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                            studentAnswer === option.key
                              ? "border-blue-500 bg-blue-50"
                              : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="mcq-answer"
                            className="mt-1"
                            checked={studentAnswer === option.key}
                            onChange={() => setStudentAnswer(option.key)}
                          />
                          <div className="text-sm text-gray-800">
                            <span className="font-semibold mr-2">{option.key}.</span>
                            {option.text}
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input
                      ref={answerRef}
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
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
                  className={`px-3 py-2 rounded-lg text-sm ${markedForReview ? "bg-purple-100 text-purple-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
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
                  className={`px-3 py-2 rounded-lg text-sm ${questionStatus === "skipped" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
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
                  className={`px-3 py-2 rounded-lg text-sm ${questionStatus === "answered" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  Mark as Answered
                </button>
              </div>

              <div className="flex justify-between mt-3">
                <button
                  onClick={handleSaveDraft}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Save Draft
                </button>
                
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !studentAnswer.trim()}
                  className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Submitting..." : "Submit Answer"}
                </button>
              </div>
            </div>

            {/* Navigation */}
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                {statusCounts.answered} Answered | {statusCounts.skipped} Skipped | {statusCounts.review} Marked | {statusCounts.unattempted} Remaining
              </div>
              <div className="grid grid-cols-8 md:grid-cols-10 gap-2">
                {assignment.map((question, idx) => {
                  const status = statusByQuestionNumber.get(question.questionNumber) ?? "unattempted";
                  const isCurrent = idx === currentQuestionIndex;
                  const tone =
                    status === "answered"
                      ? "bg-green-100 text-green-800 border-green-300"
                      : status === "skipped"
                        ? "bg-red-100 text-red-800 border-red-300"
                        : status === "review"
                          ? "bg-purple-100 text-purple-800 border-purple-300"
                          : "bg-white text-gray-700 border-gray-300";
                  return (
                    <button
                      key={question._id}
                      type="button"
                      className={`h-9 rounded-md border text-xs font-medium ${tone} ${isCurrent ? "ring-2 ring-blue-400" : ""}`}
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
                className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
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
                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Chat Sidebar */}
        <div ref={chatPanelRef} className="relative min-h-0 app-surface-card rounded-lg flex flex-col overflow-hidden">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold">CogAIt</h3>
            </div>
            {(lecturerHints ?? []).length > 0 && (
              <div className="mb-3 space-y-2">
                {(lecturerHints ?? []).slice(-2).map((hint) => (
                  <div key={hint._id} className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-900">
                    <div className="font-semibold mb-1">Your Lecturer</div>
                    <div>{hint.message}</div>
                  </div>
                ))}
              </div>
            )}
            {!aiUnlocked ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                AI locked. Validate reasoning first. Relevance must be at least 50%.
              </div>
            ) : selectedHelpLevel !== null ? (
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                <span>
                  Mode: <strong>{LEVEL_NAMES[selectedHelpLevel as keyof typeof LEVEL_NAMES]}</strong>
                </span>
                <button
                  onClick={() => setShowModeSelection((prev) => !prev)}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Change
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-600">
                Ask a question to start. You will choose a help mode on first request.
              </p>
            )}

            {showModeSelection && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {helpLevels.map((level) => {
                  const isAllowed = assignmentAllowedLevels.includes(level.level);
                  return (
                  <button
                    key={level.level}
                    onClick={() => {
                      if (!isAllowed) {
                        return;
                      }
                      setSelectedHelpLevel(level.level);
                      setShowModeSelection(false);
                      void handleComposerSend(level.level);
                    }}
                    disabled={!isAllowed}
                    className={`p-2 rounded-lg text-xs font-medium transition-colors ${
                      selectedHelpLevel === level.level
                        ? level.color
                        : isAllowed
                          ? "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <div className="font-medium">{level.name}</div>
                    <div className="text-xs opacity-75">
                      {isAllowed ? level.desc : "Locked by assignment policy"}
                    </div>
                  </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chat History */}
          <div
            ref={chatMessagesRef}
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
            style={{ paddingBottom: composerHeight + 24 }}
          >
            {mergedChatHistory.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No CogAIt interactions yet</p>
                <p className="text-xs">Ask anything about this question to get started</p>
              </div>
            ) : (
              mergedChatHistory.map((interaction) => (
                <div key={interaction.id} className="space-y-3">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="text-xs text-blue-600 font-medium mb-1">
                      {interaction.gateFeedback
                        ? "You (Reasoning Check)"
                        : `You (${LEVEL_NAMES[interaction.helpLevel as keyof typeof LEVEL_NAMES]})`}
                    </div>
                    <p className="text-sm text-gray-800">{interaction.studentInput}</p>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="text-xs text-gray-600 font-medium mb-1">CogAIt</div>
                    <MathRenderer className="text-sm text-gray-800 whitespace-pre-wrap" text={interaction.aiResponse} />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Chat Input */}
          <div ref={composerRef} className="z-20" style={composerStyle}>
            <div className="space-y-3 ui-card p-3 shadow-md">
              {imagePreview && (
                <div className="relative rounded-lg border p-2">
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="w-full h-24 object-cover rounded-md"
                  />
                  <button
                    className="absolute top-3 right-3 bg-white rounded-full p-1 shadow-sm"
                    onClick={() => {
                      setImagePreview(null);
                      setImageBase64(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-gray-200 p-2">
                <div className="flex items-end gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowAttachmentMenu((prev) => !prev)}
                      disabled={
                        isImageSubmitting || isChatting
                      }
                      className="h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 inline-flex items-center justify-center disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {showAttachmentMenu && (
                      <div className="absolute bottom-11 left-0 ui-card p-1 z-20 w-36">
                        <button
                          onClick={() => {
                            setShowAttachmentMenu(false);
                            ignoreVisibilityUntilRef.current = Date.now() + 3000;
                            void openCamera();
                          }}
                          className="w-full text-left px-2 py-2 rounded hover:bg-gray-50 text-sm inline-flex items-center"
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
                          className="w-full text-left px-2 py-2 rounded hover:bg-gray-50 text-sm inline-flex items-center"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload
                        </button>
                      </div>
                    )}
                  </div>

                  <textarea
                    ref={chatInputRef}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-sm resize-none"
                    rows={2}
                    value={chatInput}
                    disabled={!aiUnlocked}
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
                    placeholder={aiUnlocked ? "Message CogAIt..." : "AI locked until reasoning is validated (>=50%)"}
                  />

                  <button
                    onClick={() => void handleComposerSend()}
                    disabled={
                      !aiUnlocked ||
                      isChatting ||
                      isReasoningValidationRunning ||
                      isImageSubmitting ||
                      (!chatInput.trim() && !imageBase64)
                    }
                    className="h-9 w-9 rounded-full bg-blue-500 text-white hover:bg-blue-600 inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
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

              {cameraError && <p className="text-xs text-red-600">{cameraError}</p>}
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

