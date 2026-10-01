import { useEffect, useMemo, useState, useCallback } from "react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, BookOpen, Users, Activity, AlertTriangle, BarChart3, X, Copy, MoreVertical, Brain } from "lucide-react";
import { toast } from "sonner";

interface LecturerAssignment {
  _id: Id<"assignments">;
  _creationTime: number;
  lecturerId: Id<"users">;
  classroomId?: Id<"classrooms">;
  title: string;
  subject?: "Physics" | "Chemistry" | "Math";
  chapter?: string;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  description?: string;
  dueDate?: number;
  instructions?: string;
  timeLimitMinutes: number;
  totalQuestions: number;
  allowedLevels?: number[];
  isActive: boolean;
  publishedAt?: number;
  questionCount: number;
  studentsAttempted: number;
  studentsCompleted: number;
  avgIndependenceScore: number;
  isDeepDive?: boolean;
  targetStudentId?: Id<"users">;
}

const DISMISSED_PUBLISH_BANNER_KEY = "cogait:dismissed_publish_banner_assignment_v1";

export function LecturerDashboard() {
  const anyApi = api as any;
  const convex = useConvex();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const assignments = useQuery(api.assignments.getLecturerAssignments);
  const getTeacherOverview = useAction((anyApi as any)["dashboard/teacherOverview"].getTeacherOverview);
  const getAssignmentDashboard = useAction((anyApi as any)["dashboard/assignmentDashboard"].getAssignmentDashboard);
  const getStudentCognitiveProfile = useAction((anyApi as any)["dashboard/studentProfile"].getStudentCognitiveProfile);
  const [activeAlerts, setActiveAlerts] = useState<
    Array<{
      alertId: string;
      studentId: string;
      assignmentId: string;
      severity: "low" | "medium" | "high";
      alertType: string;
      message: string;
      timestamp: number;
    }>
  >([]);
  const [recommendations, setRecommendations] = useState<
    Array<{
      recommendationId: string;
      type: "topic_insight" | "intervention" | "grouping" | "strategy";
      title: string;
      description: string;
      priority: "high" | "medium" | "low";
      affectedStudents: number;
    }>
  >([]);
  const [selectedIntervention, setSelectedIntervention] = useState<"high_risk" | "overtime" | "fragile" | "today">(
    "high_risk",
  );
  const [overviewData, setOverviewData] = useState<{
    totalStudents: number;
    totalAssignments: number;
    avgIndependenceScore: number;
    avgCognitiveScore: number;
    activeAlertsCount: number;
    highRiskStudents: number;
    stale: boolean;
    updatedAt: number;
    metricVersion: string;
  } | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [intelligenceData, setIntelligenceData] = useState<{
    assignmentId: Id<"assignments">;
    assignmentTitle: string;
    summary: {
      totalStudents: number;
      completedCount: number;
      inProgressCount: number;
      notStartedCount: number;
      avgIndependenceScore: number;
      avgCognitiveScore: number;
      avgHelpRequests: number;
      avgOvertimeSeconds: number;
    };
    studentList: Array<{
      studentId: Id<"users">;
      name: string;
      progress: number;
      independenceScore: number;
      avgHelpRequests: number;
      overtimeSeconds: number;
      riskLevel: "high" | "medium" | "low";
      alerts: number;
      lastActive: number;
    }>;
    stale: boolean;
    updatedAt: number;
    metricVersion: string;
  } | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [selectedInterventionAssignmentId, setSelectedInterventionAssignmentId] = useState<Id<"assignments"> | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<Id<"users"> | null>(null);
  const [studentProfileData, setStudentProfileData] = useState<{
    student: { studentId: Id<"users">; name: string; email?: string };
    cognitiveMetrics: {
      independenceScore: number;
      cognitiveScore: number;
      avgHelpRequests: number;
      progressPercent: number;
      overtimeSeconds: number;
      riskLevel: "high" | "medium" | "low";
      alertCount: number;
    };
    stale: boolean;
    updatedAt: number;
    metricVersion: string;
  } | null>(null);
  const [studentProfileLoading, setStudentProfileLoading] = useState(false);
  const classrooms = useQuery(anyApi.classrooms.getFacultyClassrooms) as
    | Array<{ _id: string; name: string; subject?: "Physics" | "Chemistry" | "Math"; batchName?: string; joinCode: string; studentCount: number; isActive: boolean }>
    | undefined;
  const needsReview = useQuery((anyApi as any).interventions.getNeedsReviewCount) as { count: number } | undefined;
  const user = useQuery(api.users.loggedInUserWithProfile);
  const toggleAssignmentActive = useMutation(anyApi.assignments.toggleAssignmentActive);
  const deleteAssignment = useMutation(anyApi.assignments.deleteAssignment);
  const createClassroom = useMutation(anyApi.classrooms.createClassroom);
  const renameClassroom = useMutation(anyApi.classrooms.renameClassroom);
  const setClassroomActive = useMutation(anyApi.classrooms.setClassroomActive);
  const deleteClassroom = useMutation(anyApi.classrooms.deleteClassroom);
  const [latestDraftJobs, setLatestDraftJobs] = useState<
    Array<{
      jobId: string;
      assignmentId: string;
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

  const [showCreateChooser, setShowCreateChooser] = useState(false);
  const [aiBriefing, setAiBriefing] = useState<{ markdown: string; topics: string[]; alerts: string[]; interventions: string[] } | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);

  const AGENT_BASE = import.meta.env.VITE_AGENT_URL || '';

  const fetchAiBriefing = useCallback(async () => {
    setBriefingLoading(true);
    try {
      const atRiskStudents = intelligenceData?.studentList
        ?.filter(s => s.riskLevel === "high")
        ?.map(s => ({ student_id: s.name || s.studentId, reason: "High risk level detected" })) || [];
        
      const aiDependencyStudents = intelligenceData?.studentList
        ?.filter(s => s.avgHelpRequests > 3 || s.independenceScore < 40)
        ?.map(s => s.name || s.studentId) || [];

      const currentCisAvg = intelligenceData?.summary?.avgCognitiveScore || overviewData?.avgCognitiveScore || 0;

      const res = await fetch(`${AGENT_BASE}/agent7/workflow/recommendation_generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lecturer_id: user?.profile?.fullName || user?.name || user?.userId || 'lecturer',
          report_date: new Date().toISOString().split('T')[0],
          cohort_intelligence: {
            batch_id: intelligenceData?.assignmentTitle || intelligenceData?.assignmentId || "default_batch",
            report_date: new Date().toISOString().split('T')[0],
            failing_topics: [],
            at_risk_students: atRiskStudents,
            ai_dependency_students: aiDependencyStudents,
            cohort_cis_avg: currentCisAvg,
            cohort_cis_trend: "stable",
          }
        })
      });
      if (!res.ok) {
        throw new Error(`Agent 7 request failed (${res.status})`);
      }
      const data = await res.json();
      const b = data.briefing || data;
      setAiBriefing({
        markdown: b.briefing_markdown || 'No briefing available.',
        topics: b.priority_topics || [],
        alerts: b.critical_alerts || [],
        interventions: b.recommended_interventions || [],
      });
    } catch (e) {
      console.error('Agent 7 briefing fetch failed:', e);
      toast.error("Agent 7 briefing failed. Check agent 7 service.");
    } finally {
      setBriefingLoading(false);
    }
  }, [AGENT_BASE, user?.userId, user?.profile?.fullName, intelligenceData, overviewData]);
  const [showCreateClassroom, setShowCreateClassroom] = useState(false);
  const [classroomName, setClassroomName] = useState("");
  const [classroomSubject, setClassroomSubject] = useState<"Physics" | "Chemistry" | "Math">("Physics");
  const [classroomBatch, setClassroomBatch] = useState("");
  const [classroomLimit, setClassroomLimit] = useState("");
  const [creatingClassroom, setCreatingClassroom] = useState(false);
  const [togglingAssignmentId, setTogglingAssignmentId] = useState<string | null>(null);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);
  const safeAssignments = assignments ?? [];
  const activeUploadJob = latestDraftJobs?.find(
    (job) => job.inputType === "pdf" && !job.isPublished && (job.status === "pending" || job.status === "processing"),
  );
  const readyUploadJob = latestDraftJobs?.find(
    (job) =>
      job.inputType === "pdf" &&
      !job.isPublished &&
      (job.status === "review_ready" || job.status === "completed") &&
      String(job.assignmentId) !== dismissedPublishAssignmentId &&
      !safeAssignments.find((a) => a._id === job.assignmentId)?.isActive,
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(DISMISSED_PUBLISH_BANNER_KEY);
    setDismissedPublishAssignmentId(saved && saved.trim() ? saved : null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOverviewLoading(true);
    void getTeacherOverview({})
      .then((result) => {
        if (!cancelled) {
          setOverviewData(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOverviewData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getTeacherOverview]);

  useEffect(() => {
    if (!selectedInterventionAssignmentId && safeAssignments.length > 0) {
      setSelectedInterventionAssignmentId(safeAssignments[0]._id);
    }
  }, [safeAssignments, selectedInterventionAssignmentId]);

  useEffect(() => {
    if (!selectedInterventionAssignmentId) {
      setIntelligenceData(null);
      return;
    }
    let cancelled = false;
    setIntelligenceLoading(true);
    void getAssignmentDashboard({ assignmentId: selectedInterventionAssignmentId })
      .then((result) => {
        if (!cancelled) {
          setIntelligenceData(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIntelligenceData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIntelligenceLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getAssignmentDashboard, selectedInterventionAssignmentId]);

  useEffect(() => {
    if (!selectedInterventionAssignmentId || !selectedStudentId) {
      setStudentProfileData(null);
      return;
    }
    let cancelled = false;
    setStudentProfileLoading(true);
    void getStudentCognitiveProfile({ assignmentId: selectedInterventionAssignmentId, studentId: selectedStudentId })
      .then((result) => {
        if (!cancelled) {
          setStudentProfileData(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStudentProfileData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStudentProfileLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getStudentCognitiveProfile, selectedInterventionAssignmentId, selectedStudentId]);

  useEffect(() => {
    let cancelled = false;
    void convex
      .query((anyApi as any).facultyAssignments.getLatestDraftJobs, {})
      .then((rows) => {
        if (!cancelled) {
          setLatestDraftJobs(rows ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLatestDraftJobs([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [convex, anyApi]);

  useEffect(() => {
    let cancelled = false;
    void convex
      .query((anyApi as any)["dashboard/alerts"].getActiveAlerts, {})
      .then((rows) => {
        if (!cancelled) {
          setActiveAlerts(rows ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActiveAlerts([]);
        }
      });
    void convex
      .query((anyApi as any)["dashboard/recommendations"].getFacultyRecommendations, {})
      .then((rows) => {
        if (!cancelled) {
          setRecommendations(rows ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRecommendations([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [convex, anyApi]);

  const section = (searchParams.get("section") ?? "home") as
    | "home"
    | "assignments"
    | "classrooms"
    | "interventions";
  const filter = (searchParams.get("filter") ?? "all") as
    | "all"
    | "active"
    | "needs_review"
    | "engaged";
  const filteredAssignments = useMemo(() => {
    if (filter === "active") {
      return safeAssignments.filter((a) => a.isActive);
    }
    if (filter === "engaged") {
      return safeAssignments.filter((a) => a.studentsAttempted > 0);
    }
    if (filter === "needs_review") {
      return safeAssignments.filter((a) => !a.isActive);
    }
    return safeAssignments;
  }, [safeAssignments, filter]);

  const stats = {
    totalAssignments: safeAssignments.length,
    totalStudents: safeAssignments.reduce((sum, a) => sum + a.studentsAttempted, 0),
    activeAssignments: safeAssignments.filter((a) => a.isActive).length,
    pendingReviews: needsReview?.count ?? safeAssignments.filter((a) => !a.isActive).length,
  };
  const intelligenceStudents = intelligenceData?.studentList ?? [];
  const highRiskCount = intelligenceStudents.filter((student) => student.riskLevel === "high").length;
  const overtimeCount = intelligenceStudents.filter((student) => student.overtimeSeconds > 0).length;
  const fragileCount = intelligenceStudents.filter((student) => student.independenceScore < 50).length;
  const todayCount = activeAlerts?.length ?? 0;
  const interventionStudentsByType = intelligenceStudents.filter((student) => {
    if (selectedIntervention === "high_risk") {
      return student.riskLevel === "high";
    }
    if (selectedIntervention === "overtime") {
      return student.overtimeSeconds > 0;
    }
    if (selectedIntervention === "fragile") {
      return student.independenceScore < 50;
    }
    return student.alerts > 0;
  });
  const formatFreshness = (updatedAt?: number) => {
    if (!updatedAt || updatedAt <= 0) {
      return "No rollup yet";
    }
    const deltaMs = Date.now() - updatedAt;
    const minutes = Math.max(0, Math.floor(deltaMs / 60000));
    if (minutes < 1) {
      return "Updated just now";
    }
    if (minutes < 60) {
      return `Updated ${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    return `Updated ${hours}h ago`;
  };
  const classroomNameById = new Map((classrooms ?? []).map((room) => [room._id, room.name]));

  if (assignments === undefined) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-1/3"></div>
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-white/5 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const setFilter = (next: "all" | "active" | "needs_review" | "engaged") => {
    if (next === "all") {
      setSearchParams({ section: "assignments" });
      navigate("/lecturer/assignments?section=assignments");
      return;
    }
    setSearchParams({ section: "assignments", filter: next });
    navigate(`/lecturer/assignments?section=assignments&filter=${next}`);
  };

  const handleToggle = async (assignmentId: Id<"assignments">) => {
    setTogglingAssignmentId(assignmentId);
    try {
      const result = await toggleAssignmentActive({ assignmentId });
      toast.success(result.isActive ? "Assignment activated" : "Assignment deactivated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update assignment status";
      toast.error(message);
    } finally {
      setTogglingAssignmentId(null);
    }
  };

  const handleDeleteAssignment = async (assignmentId: Id<"assignments">) => {
    const confirmed = window.confirm(
      "Delete this assignment from the classroom? This will remove questions and student attempt data for this assignment.",
    );
    if (!confirmed) {
      return;
    }

    setDeletingAssignmentId(assignmentId);
    try {
      await deleteAssignment({ assignmentId });
      toast.success("Assignment deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete assignment";
      toast.error(message);
    } finally {
      setDeletingAssignmentId(null);
    }
  };

  const handleCreateClassroom = async () => {
    if (!classroomName.trim()) {
      toast.error("Classroom name is required");
      return;
    }
    setCreatingClassroom(true);
    try {
      const created = await createClassroom({ name: classroomName.trim() });
      toast.success(`Classroom created. Join code: ${created.joinCode}`);
      setClassroomName("");
      setClassroomBatch("");
      setClassroomLimit("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create classroom";
      toast.error(message);
    } finally {
      setCreatingClassroom(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Class code copied");
    } catch {
      toast.error("Could not copy class code");
    }
  };

  const handleRenameClassroom = async (classroomId: string, currentName: string) => {
    const nextName = window.prompt("Edit classroom name", currentName);
    if (!nextName || nextName.trim() === currentName.trim()) {
      return;
    }
    try {
      await renameClassroom({ classroomId: classroomId as Id<"classrooms">, name: nextName.trim() });
      toast.success("Classroom updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update classroom";
      toast.error(message);
    }
  };

  const handleSetClassroomActive = async (classroomId: string, isActive: boolean) => {
    try {
      await setClassroomActive({ classroomId: classroomId as Id<"classrooms">, isActive });
      toast.success(isActive ? "Classroom restored" : "Classroom archived");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update classroom";
      toast.error(message);
    }
  };

  const handleDeleteClassroom = async (classroomId: string) => {
    const confirmed = window.confirm("Delete this classroom?");
    if (!confirmed) {
      return;
    }
    try {
      await deleteClassroom({ classroomId: classroomId as Id<"classrooms"> });
      toast.success("Classroom deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete classroom";
      toast.error(message);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8 spatial-enter spatial-stagger-1">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome, {user?.profile?.fullName}</h1>
          <p className="text-white/50">Monitor student thinking and create assignments</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowCreateChooser(true);
            }}
            className="inline-flex items-center px-6 py-3 bg-[var(--color-primary)] text-white rounded-xl hover:bg-[var(--color-primary-hover)] transition-all font-medium disabled:opacity-70 shadow-[0_8px_20px_rgba(72,32,220,0.35)] backdrop-blur-sm"
            disabled={false}
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Assignment
          </button>
        </div>
      </div>

      {activeUploadJob && (
        <div className="mb-4 rounded-xl border border-[rgba(72,32,220,0.3)] bg-[rgba(72,32,220,0.1)] p-3 text-sm text-white/80 backdrop-blur-sm">
          AI upload in progress for <span className="font-semibold text-white">{activeUploadJob.assignmentTitle}</span>. Processing continues in background.
        </div>
      )}
      {readyUploadJob && (
        <div className="mb-4 rounded-xl border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.1)] p-3 text-sm flex items-start justify-between gap-3 backdrop-blur-sm">
            <button
              type="button"
              onClick={() =>
                navigate(`/lecturer/assignment/ai-create?assignmentId=${readyUploadJob.assignmentId}`)
              }
              className="text-emerald-400 font-medium hover:underline text-left"
            >
              Click Here to review and publish
            </button>
            <button
              type="button"
              aria-label="Dismiss publish prompt"
              className="text-emerald-400 hover:text-emerald-300"
              onClick={(event) => {
                event.stopPropagation();
                const assignmentKey = String(readyUploadJob.assignmentId);
                setDismissedPublishAssignmentId(assignmentKey);
                window.localStorage.setItem(DISMISSED_PUBLISH_BANNER_KEY, assignmentKey);
              }}
            >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* AI Daily Briefing Panel */}
      {(section === "home" || section === "assignments") && (
        <div className="mb-6 spatial-widget widget-purple p-5 spatial-enter spatial-stagger-2 relative overflow-hidden">
          <div className="ambient-dots rounded-[16px]" style={{ opacity: 0.1 }} />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-[var(--color-primary-solid)]" />
                <h2 className="text-lg font-semibold text-white">AI Daily Briefing</h2>
                <span className="text-xs bg-[rgba(72,32,220,0.3)] text-white/70 px-2 py-0.5 rounded-full border border-[rgba(72,32,220,0.4)]">Agent 7</span>
              </div>
              <button
                onClick={() => void fetchAiBriefing()}
                disabled={briefingLoading}
                className="px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-all backdrop-blur-sm"
              >
                {briefingLoading ? 'Generating...' : aiBriefing ? 'Refresh' : 'Generate Briefing'}
              </button>
            </div>
            {aiBriefing ? (
              <div className="prose prose-sm prose-invert max-w-none text-white/80" style={{ whiteSpace: 'pre-wrap' }}>
                {aiBriefing.markdown}
              </div>
            ) : (
              <p className="text-sm text-white/40 italic">Click &quot;Generate Briefing&quot; to get AI-powered insights about your students.</p>
            )}
          </div>
        </div>
      )}

      {(section === "home" || section === "assignments") && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
          <button
            onClick={() => setFilter("all")}
            className="spatial-widget rounded-xl p-6 text-left hover:scale-[1.02] transition-all spatial-enter spatial-stagger-3"
          >
            <div className="flex items-center">
              <BookOpen className="h-8 w-8 text-[var(--color-primary-solid)]" />
              <div className="ml-4">
                <p className="widget-label">Total Assignments</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.totalAssignments}</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setFilter("engaged")}
            className="spatial-widget rounded-xl p-6 text-left hover:scale-[1.02] transition-all spatial-enter spatial-stagger-4"
          >
            <div className="flex items-center">
              <Users className="h-8 w-8 text-emerald-400" />
              <div className="ml-4">
                <p className="widget-label">Students Engaged</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.totalStudents}</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setFilter("active")}
            className="spatial-widget rounded-xl p-6 text-left hover:scale-[1.02] transition-all spatial-enter spatial-stagger-5"
          >
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-amber-400" />
              <div className="ml-4">
                <p className="widget-label">Active Assignments</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.activeAssignments}</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setFilter("needs_review")}
            className="spatial-widget rounded-xl p-6 text-left hover:scale-[1.02] transition-all spatial-enter spatial-stagger-6"
          >
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <div className="ml-4">
                <p className="widget-label">Needs Review</p>
                <p className="text-2xl font-bold text-white mt-1">{stats.pendingReviews}</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {(section === "home" || section === "assignments") && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="app-section-title">
              {section === "home"
                ? "Recent Assignments"
                : filter === "all"
                  ? "Your Assignments"
                  : filter === "active"
                    ? "Active Assignments"
                    : filter === "engaged"
                      ? "Student Engaged Assignments"
                      : "Needs Review"}
            </h2>
            {filter !== "all" && (
              <button onClick={() => setFilter("all")} className="text-sm text-[var(--color-primary-solid)] hover:text-[var(--color-primary-hover)]">
                Clear Filter
              </button>
            )}
          </div>

          {(section === "home" ? filteredAssignments.slice(0, 4) : filteredAssignments).length === 0 ? (
            <div className="spatial-widget p-8 text-center">
              <BookOpen className="h-12 w-12 text-white/20 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No assignments found</h3>
              <p className="text-white/50 mb-4">
                {filter === "all"
                  ? "Create your first assignment to start tracking student thinking patterns."
                  : "No assignments match this filter."}
              </p>
              <button
                onClick={() => setShowCreateChooser(true)}
                className="inline-flex items-center px-4 py-2 bg-[var(--color-primary)] text-white rounded-xl hover:bg-[var(--color-primary-hover)] transition-all shadow-[0_8px_20px_rgba(72,32,220,0.35)]"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Assignment
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {(section === "home" ? filteredAssignments.slice(0, 4) : filteredAssignments).map((assignment) => (
                <AssignmentCard
                  key={assignment._id}
                  assignment={assignment}
                  classroomName={assignment.classroomId ? classroomNameById.get(assignment.classroomId) : undefined}
                  toggling={togglingAssignmentId === assignment._id}
                  deleting={deletingAssignmentId === assignment._id}
                  onEdit={() => navigate(`/lecturer/assignment/${assignment._id}/edit`)}
                  onToggle={() => void handleToggle(assignment._id)}
                  onDelete={() => void handleDeleteAssignment(assignment._id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {(section === "classrooms" || section === "home") && (
        <div className="mt-8 spatial-widget p-5 spatial-enter spatial-stagger-7">
          <div className="flex items-center justify-between mb-3">
            <h2 className="app-section-title text-lg mb-3">Your Classrooms</h2>
            <button
              type="button"
              onClick={() => setShowCreateClassroom(true)}
              className="px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] text-sm transition-all shadow-[0_8px_20px_rgba(72,32,220,0.35)]"
            >
              Create Classroom
            </button>
          </div>
          {classrooms === undefined ? (
            <p className="text-white/40">Loading classrooms...</p>
          ) : classrooms.length === 0 ? (
            <p className="text-white/40">No classrooms created yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {classrooms.map((classroom) => (
                <ClassroomCard
                  key={classroom._id}
                  classroom={classroom}
                  onCopyCode={() => void copyCode(classroom.joinCode)}
                  onRename={() => void handleRenameClassroom(classroom._id, classroom.name)}
                  onArchiveToggle={() => void handleSetClassroomActive(classroom._id, !classroom.isActive)}
                  onDelete={() => void handleDeleteClassroom(classroom._id)}
                />
              ))}
            </div>
          )}
        </div>
      )}


      {showCreateChooser && (
        <div className="ui-modal-backdrop">
          <div className="ui-modal max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Create Assignment</h3>
              <button onClick={() => setShowCreateChooser(false)} className="text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3">
              <Link
                to="/lecturer/assignment/ai-create"
                onClick={() => setShowCreateChooser(false)}
                className="px-4 py-3 rounded-xl bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] text-center font-medium transition-all shadow-[0_8px_20px_rgba(72,32,220,0.35)]"
              >
                AI Generated
              </Link>
              <Link
                to="/lecturer/assignment/create"
                onClick={() => setShowCreateChooser(false)}
                className="px-4 py-3 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] text-center font-medium transition-all shadow-[0_8px_20px_rgba(220,40,120,0.35)]"
              >
                Manual
              </Link>
            </div>
          </div>
        </div>
      )}

      {showCreateClassroom && (
        <div className="ui-modal-backdrop">
          <div className="ui-modal max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Create Classroom</h3>
              <button onClick={() => setShowCreateClassroom(false)} className="text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              value={classroomName}
              onChange={(e) => setClassroomName(e.target.value)}
              placeholder="Class name (e.g., Physics 2026 - Section A)"
              className="auth-input-field"
            />
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <select
                value={classroomSubject}
                onChange={(e) => setClassroomSubject(e.target.value as "Physics" | "Chemistry" | "Math")}
                className="auth-input-field"
              >
                <option value="Physics">Physics</option>
                <option value="Chemistry">Chemistry</option>
                <option value="Math">Math</option>
              </select>
              <input
                value={classroomBatch}
                onChange={(e) => setClassroomBatch(e.target.value)}
                placeholder="Batch (optional)"
                className="auth-input-field"
              />
              <input
                type="number"
                min={1}
                value={classroomLimit}
                onChange={(e) => setClassroomLimit(e.target.value)}
                placeholder="Limit (optional)"
                className="auth-input-field"
              />
            </div>
            <button
              onClick={() => {
                if (!classroomName.trim()) {
                  toast.error("Classroom name is required");
                  return;
                }
                setCreatingClassroom(true);
                void createClassroom({
                  name: classroomName.trim(),
                  subject: classroomSubject,
                  batchName: classroomBatch.trim() || undefined,
                  studentLimit: classroomLimit ? Number(classroomLimit) : undefined,
                })
                  .then((created) => {
                    toast.success(`Classroom created. Join code: ${created.joinCode}`);
                    setClassroomName("");
                    setClassroomBatch("");
                    setClassroomLimit("");
                    setShowCreateClassroom(false);
                  })
                  .catch((error) => {
                    const message = error instanceof Error ? error.message : "Failed to create classroom";
                    toast.error(message);
                  })
                  .finally(() => {
                    setCreatingClassroom(false);
                  });
              }}
              disabled={creatingClassroom}
              className="w-full mt-3 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-all shadow-[0_8px_20px_rgba(72,32,220,0.35)]"
            >
              {creatingClassroom ? "Creating..." : "Generate class code"}
            </button>
          </div>
        </div>
      )}


    </div>
  );
}


function ClassroomCard({
  classroom,
  onCopyCode,
  onRename,
  onArchiveToggle,
  onDelete,
}: {
  classroom: { _id: string; name: string; subject?: "Physics" | "Chemistry" | "Math"; batchName?: string; joinCode: string; studentCount: number; isActive: boolean };
  onCopyCode: () => void;
  onRename: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="border border-[var(--color-border)] rounded-xl p-4 relative bg-[var(--color-surface)] backdrop-blur-xl transition-all hover:border-[var(--color-border-strong)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-white">{classroom.name}</p>
          {!classroom.isActive && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-[rgba(245,158,11,0.15)] text-amber-400 border border-[rgba(245,158,11,0.3)]">
              Archived
            </span>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="h-8 w-8 rounded-xl hover:bg-[rgba(255,255,255,0.08)] inline-flex items-center justify-center transition-colors"
          >
            <MoreVertical className="h-4 w-4 text-white/40" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 w-44 bg-[rgba(20,20,30,0.95)] border border-[var(--color-border)] rounded-xl shadow-float py-1 z-20 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRename();
                }}
                className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
              >
                Edit classroom
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onCopyCode();
                }}
                className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
              >
                Copy code
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onArchiveToggle();
                }}
                className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-[rgba(255,255,255,0.06)] hover:text-white"
              >
                {classroom.isActive ? "Archive" : "Restore"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[rgba(239,68,68,0.1)]"
              >
                Delete classroom
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm text-white/50">
          Code: <span className="font-semibold tracking-wide text-white/80">{classroom.joinCode}</span>
        </p>
        <button
          onClick={onCopyCode}
          className="ui-button ui-button-secondary text-sm px-2 py-1"
        >
          <Copy className="h-3 w-3 mr-1" />
          Copy
        </button>
      </div>
      {(classroom.subject || classroom.batchName) && (
        <p className="text-xs text-white/30 mt-1">
          {[classroom.subject, classroom.batchName].filter(Boolean).join(" · ")}
        </p>
      )}
      <p className="text-xs text-white/30 mt-2">{classroom.studentCount} students joined</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          to={`/lecturer/assignment/create?classroomId=${classroom._id}`}
          className="text-center px-3 py-2 rounded-lg bg-[rgba(72,32,220,0.15)] text-[var(--color-primary-solid)] hover:bg-[rgba(72,32,220,0.25)] text-sm border border-[rgba(72,32,220,0.3)] transition-all"
        >
          Manual
        </Link>
        <Link
          to={`/lecturer/assignment/ai-create?classroomId=${classroom._id}`}
          className="text-center px-3 py-2 rounded-lg bg-[rgba(220,40,120,0.15)] text-[var(--color-accent-solid)] hover:bg-[rgba(220,40,120,0.25)] text-sm border border-[rgba(220,40,120,0.3)] transition-all"
        >
          AI
        </Link>
      </div>
    </div>
  );
}
function AssignmentCard({
  assignment,
  classroomName,
  toggling,
  deleting,
  onEdit,
  onToggle,
  onDelete,
}: {
  assignment: LecturerAssignment;
  classroomName?: string;
  toggling: boolean;
  deleting: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const displayTitle = assignment.title.trim() || "Untitled Assignment";
  const subtitleParts = [assignment.subject, assignment.chapter, assignment.difficulty].filter(Boolean);
  const getStatusBadge = () => {
    if (assignment.isActive) {
      return <span className="px-2 py-1 bg-[rgba(16,185,129,0.15)] text-emerald-400 rounded-full text-xs font-medium border border-[rgba(16,185,129,0.3)]">Active</span>;
    }
    return <span className="px-2 py-1 bg-[rgba(255,255,255,0.06)] text-white/50 rounded-full text-xs font-medium border border-[var(--color-border)]">Draft</span>;
  };

  const getIndependenceColor = (score: number) => {
    if (score >= 70) return "text-emerald-400";
    if (score >= 40) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="spatial-widget p-6 hover:shadow-float-hover transition-all">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h3 className="text-lg font-semibold text-white">{displayTitle}</h3>
            {assignment.isDeepDive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(139,92,246,0.15)] border border-[rgba(139,92,246,0.3)] text-violet-400 text-[10px] font-bold uppercase tracking-wider shrink-0 cursor-help" title="AI-generated practice session specific to a single student">
                {"🔬"} Deep Dive
              </span>
            )}
            {getStatusBadge()}
            {!assignment.title.trim() && (
              <span className="px-2 py-1 bg-[rgba(245,158,11,0.15)] text-amber-400 rounded-full text-xs font-medium border border-[rgba(245,158,11,0.3)]">
                Untitled
              </span>
            )}
          </div>
          {classroomName && <p className="text-xs text-[var(--color-primary-solid)] mb-2">Classroom: {classroomName}</p>}
          {subtitleParts.length > 0 && (
            <p className="text-xs text-white/30 mb-2">{subtitleParts.join(" · ")}</p>
          )}

          {assignment.description && <p className="text-white/50 mb-3 line-clamp-2">{assignment.description}</p>}

          <div className="mt-2 mb-3 text-sm text-white/50 font-medium">
            Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : "No due date"}
          </div>

          <div className="flex items-center gap-6 text-sm text-white/30">
            <span>{assignment.questionCount} questions</span>
            <span>{assignment.studentsAttempted} students attempted</span>
            <span>{assignment.studentsCompleted} completed</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="text-right">
            <p className="widget-label">Avg Independence Score</p>
            {assignment.studentsAttempted > 0 && assignment.avgIndependenceScore === 0 ? (
              <p className="text-sm text-white/40 mt-1">Calculating...</p>
            ) : (
              <p className={`text-2xl font-bold mt-1 ${getIndependenceColor(assignment.avgIndependenceScore)}`}>
                {assignment.avgIndependenceScore}%
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="flex flex-wrap gap-2">
          <Link
            to={`/lecturer/assignment/${assignment._id}/analytics`}
            className="inline-flex items-center px-3 py-1 bg-[rgba(72,32,220,0.15)] text-[var(--color-primary-solid)] rounded-lg hover:bg-[rgba(72,32,220,0.25)] transition-all text-sm border border-[rgba(72,32,220,0.3)]"
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            View Analytics
          </Link>
          <Link
            to={`/lecturer/assignment/${assignment._id}/live`}
            className="inline-flex items-center px-3 py-1 bg-[rgba(16,185,129,0.15)] text-emerald-400 rounded-lg hover:bg-[rgba(16,185,129,0.25)] transition-all text-sm border border-[rgba(16,185,129,0.3)]"
          >
            View Live Session
          </Link>

          <button
            onClick={onEdit}
            className="inline-flex items-center px-3 py-1 bg-[rgba(255,255,255,0.06)] text-white/60 rounded-lg hover:bg-[rgba(255,255,255,0.1)] hover:text-white transition-all text-sm border border-[var(--color-border)]"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center px-3 py-1 bg-[rgba(239,68,68,0.1)] text-red-400 rounded-lg hover:bg-[rgba(239,68,68,0.2)] transition-all text-sm disabled:opacity-50 border border-[rgba(239,68,68,0.3)]"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>

        <button
          onClick={onToggle}
          disabled={toggling}
          className="text-sm text-white/40 hover:text-white disabled:opacity-50 transition-colors"
        >
          {toggling ? "Updating..." : assignment.isActive ? "Deactivate" : "Activate"}
        </button>
      </div>
    </div>
  );
}
