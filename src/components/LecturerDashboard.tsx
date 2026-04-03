import { useEffect, useMemo, useState } from "react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, BookOpen, Users, Activity, AlertTriangle, BarChart3, X, Copy, MoreVertical } from "lucide-react";
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
  allowedLevels: number[];
  isActive: boolean;
  publishedAt?: number;
  questionCount: number;
  studentsAttempted: number;
  studentsCompleted: number;
  avgIndependenceScore: number;
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
  const [showCreateClassroom, setShowCreateClassroom] = useState(false);
  const [classroomName, setClassroomName] = useState("");
  const [classroomSubject, setClassroomSubject] = useState<"Physics" | "Chemistry" | "Math">("Physics");
  const [classroomBatch, setClassroomBatch] = useState("");
  const [classroomLimit, setClassroomLimit] = useState("");
  const [creatingClassroom, setCreatingClassroom] = useState(false);
  const [togglingAssignmentId, setTogglingAssignmentId] = useState<string | null>(null);
  const [deletingAssignmentId, setDeletingAssignmentId] = useState<string | null>(null);
  const [rosterClassroomId, setRosterClassroomId] = useState<string | null>(null);
  const roster = useQuery(
    (anyApi as any).classrooms.getClassroomRoster,
    rosterClassroomId ? { classroomId: rosterClassroomId as Id<"classrooms"> } : "skip",
  ) as
    | Array<{
        studentId: string;
        fullName: string;
        joinedAt: number;
        assignmentsAttempted: number;
        avgCis: number;
        avgIndependence: number;
        trend: number[];
      }>
    | undefined;
  const safeAssignments = assignments ?? [];
  const activeUploadJob = latestDraftJobs?.find(
    (job) => job.inputType === "pdf" && !job.isPublished && (job.status === "pending" || job.status === "processing"),
  );
  const readyUploadJob = latestDraftJobs?.find(
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
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
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
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome, {user?.profile?.fullName}</h1>
          <p className="text-gray-600">Monitor student thinking and create assignments</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setShowCreateChooser(true);
            }}
            className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium disabled:opacity-70"
            disabled={false}
          >
            <Plus className="h-5 w-5 mr-2" />
            Create Assignment
          </button>
        </div>
      </div>

      {activeUploadJob && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          AI upload in progress for <span className="font-semibold">{activeUploadJob.assignmentTitle}</span>. Processing continues in background.
        </div>
      )}
      {readyUploadJob && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(`/lecturer/assignment/${readyUploadJob.assignmentId}/edit`)}
            className="text-green-800 font-medium hover:underline text-left"
          >
            Click Here to review and publish
          </button>
          <button
            type="button"
            aria-label="Dismiss publish prompt"
            className="text-green-700 hover:text-green-900"
            onClick={() => {
              setDismissedPublishAssignmentId(readyUploadJob.assignmentId);
              window.localStorage.setItem(DISMISSED_PUBLISH_BANNER_KEY, readyUploadJob.assignmentId);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(section === "home" || section === "assignments") && (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => setFilter("all")}
          className="bg-white rounded-lg shadow-sm border p-6 text-left hover:border-blue-300 transition-colors"
        >
          <div className="flex items-center">
            <BookOpen className="h-8 w-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Assignments</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalAssignments}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFilter("engaged")}
          className="bg-white rounded-lg shadow-sm border p-6 text-left hover:border-green-300 transition-colors"
        >
          <div className="flex items-center">
            <Users className="h-8 w-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Students Engaged</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalStudents}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFilter("active")}
          className="bg-white rounded-lg shadow-sm border p-6 text-left hover:border-orange-300 transition-colors"
        >
          <div className="flex items-center">
            <Activity className="h-8 w-8 text-orange-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Assignments</p>
              <p className="text-2xl font-bold text-gray-900">{stats.activeAssignments}</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setFilter("needs_review")}
          className="bg-white rounded-lg shadow-sm border p-6 text-left hover:border-red-300 transition-colors"
        >
          <div className="flex items-center">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Needs Review</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pendingReviews}</p>
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
            <button onClick={() => setFilter("all")} className="text-sm text-blue-600 hover:text-blue-700">
              Clear Filter
            </button>
          )}
        </div>

        {(section === "home" ? filteredAssignments.slice(0, 4) : filteredAssignments).length === 0 ? (
          <div className="app-surface-card p-8 text-center">
            <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assignments found</h3>
            <p className="text-gray-600 mb-4">
              {filter === "all"
                ? "Create your first assignment to start tracking student thinking patterns."
                : "No assignments match this filter."}
            </p>
            <button
              onClick={() => setShowCreateChooser(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
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
                onIntervene={() => setSelectedInterventionAssignmentId(assignment._id)}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {(section === "classrooms" || section === "home") && (
      <div className="mt-8 app-surface-card p-5">
        <div className="flex items-center justify-between mb-3">
        <h2 className="app-section-title text-lg mb-3">Your Classrooms</h2>
          <button
            type="button"
            onClick={() => setShowCreateClassroom(true)}
            className="px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 text-sm"
          >
            Create Classroom
          </button>
        </div>
        {classrooms === undefined ? (
          <p className="text-gray-500">Loading classrooms...</p>
        ) : classrooms.length === 0 ? (
          <p className="text-gray-500">No classrooms created yet.</p>
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
                onViewRoster={() => setRosterClassroomId(classroom._id)}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {section === "interventions" && (
        <div className="space-y-4">
          <div className="app-surface-card p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="app-section-title text-lg">Overview</h2>
                <p className="text-sm text-gray-500">
                  {overviewLoading ? "Loading rollups..." : formatFreshness(overviewData?.updatedAt)}
                  {overviewData?.stale ? " â€¢ stale data" : ""}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div className="rounded-lg border p-2">
                  <p className="text-gray-500">Students</p>
                  <p className="font-semibold">{overviewData?.totalStudents ?? 0}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-gray-500">Assignments</p>
                  <p className="font-semibold">{overviewData?.totalAssignments ?? 0}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-gray-500">Avg CIS</p>
                  <p className="font-semibold">{overviewData?.avgCognitiveScore ?? 0}</p>
                </div>
                <div className="rounded-lg border p-2">
                  <p className="text-gray-500">Avg Independence</p>
                  <p className="font-semibold">{overviewData?.avgIndependenceScore ?? 0}%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="app-surface-card p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h2 className="app-section-title text-lg">Assignment Intelligence</h2>
                <p className="text-sm text-gray-500">
                  {intelligenceLoading ? "Loading assignment rollup..." : formatFreshness(intelligenceData?.updatedAt)}
                  {intelligenceData?.stale ? " â€¢ stale data" : ""}
                </p>
              </div>
              <select
                value={selectedInterventionAssignmentId ?? ""}
                onChange={(e) => setSelectedInterventionAssignmentId(e.target.value as Id<"assignments">)}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                {safeAssignments.map((assignment) => (
                  <option key={assignment._id} value={assignment._id}>
                    {assignment.title.trim() || "Untitled Assignment"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <InterventionButton
              label="High Risk Students"
              value={highRiskCount}
              active={selectedIntervention === "high_risk"}
              tone="danger"
              onClick={() => setSelectedIntervention("high_risk")}
            />
            <InterventionButton
              label="Overtime Students"
              value={overtimeCount}
              active={selectedIntervention === "overtime"}
              tone="warn"
              onClick={() => setSelectedIntervention("overtime")}
            />
            <InterventionButton
              label="Fragile Attempts"
              value={fragileCount}
              active={selectedIntervention === "fragile"}
              tone="info"
              onClick={() => setSelectedIntervention("fragile")}
            />
            <InterventionButton
              label="Today Interventions"
              value={todayCount}
              active={selectedIntervention === "today"}
              tone="good"
              onClick={() => setSelectedIntervention("today")}
            />
          </div>

          <div className="app-surface-card p-5 space-y-4">
            <h2 className="app-section-title text-lg">Intervention Details</h2>
            <p className="text-sm text-gray-500 mt-1">Click a metric above to see related students.</p>
            <div className="mt-4 space-y-3">
              {intelligenceLoading ? (
                <p className="text-sm text-gray-500">Loading students...</p>
              ) : interventionStudentsByType.length === 0 ? (
                <p className="text-sm text-gray-500">No students in this category right now.</p>
              ) : (
                interventionStudentsByType.map((student) => (
                  <button
                    type="button"
                    key={student.studentId}
                    onClick={() => setSelectedStudentId(student.studentId)}
                    className="w-full text-left rounded-xl border p-3 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-500">Progress {student.progress}%</p>
                    </div>
                    <div className="mt-2 text-xs text-gray-600 grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div>Independence: <span className="font-semibold">{student.independenceScore}%</span></div>
                      <div>Help Avg: <span className="font-semibold">{student.avgHelpRequests.toFixed(1)}</span></div>
                      <div>Overtime: <span className="font-semibold">{Math.round(student.overtimeSeconds / 60)} min</span></div>
                      <div>Risk: <span className="font-semibold">{student.riskLevel}</span></div>
                      <div>Alerts: <span className="font-semibold">{student.alerts}</span></div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="rounded-xl border p-4">
              <h3 className="font-semibold text-gray-900">Student Cognitive Profile</h3>
              {studentProfileLoading ? (
                <p className="text-sm text-gray-500 mt-2">Loading profile...</p>
              ) : !studentProfileData ? (
                <p className="text-sm text-gray-500 mt-2">Select a student to view profile rollups.</p>
              ) : (
                <div className="mt-2 text-sm grid md:grid-cols-3 gap-2">
                  <div>Name: <span className="font-semibold">{studentProfileData.student.name}</span></div>
                  <div>CIS: <span className="font-semibold">{studentProfileData.cognitiveMetrics.cognitiveScore}</span></div>
                  <div>Independence: <span className="font-semibold">{studentProfileData.cognitiveMetrics.independenceScore}%</span></div>
                  <div>Help Avg: <span className="font-semibold">{studentProfileData.cognitiveMetrics.avgHelpRequests.toFixed(1)}</span></div>
                  <div>Overtime: <span className="font-semibold">{Math.round(studentProfileData.cognitiveMetrics.overtimeSeconds / 60)} min</span></div>
                  <div>Risk: <span className="font-semibold">{studentProfileData.cognitiveMetrics.riskLevel}</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="app-surface-card p-5">
              <h2 className="app-section-title text-lg">Alerts</h2>
              <p className="text-sm text-gray-500 mt-1">From dependencyAlerts (single source).</p>
              <div className="mt-3 space-y-2">
                {activeAlerts === undefined ? (
                  <p className="text-sm text-gray-500">Loading alerts...</p>
                ) : activeAlerts.length === 0 ? (
                  <p className="text-sm text-gray-500">No active alerts.</p>
                ) : (
                  activeAlerts.slice(0, 8).map((alert) => (
                    <div key={alert.alertId} className="rounded-lg border p-3">
                      <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {alert.alertType} â€¢ {alert.severity}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="app-surface-card p-5">
              <h2 className="app-section-title text-lg">Recommendations</h2>
              <p className="text-sm text-gray-500 mt-1">Query-generated, safe-action only.</p>
              <div className="mt-3 space-y-2">
                {recommendations === undefined ? (
                  <p className="text-sm text-gray-500">Loading recommendations...</p>
                ) : recommendations.length === 0 ? (
                  <p className="text-sm text-gray-500">No recommendations yet.</p>
                ) : (
                  recommendations.slice(0, 8).map((rec) => (
                    <div key={rec.recommendationId} className="rounded-lg border p-3">
                      <p className="text-sm font-medium text-gray-900">{rec.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {rec.type} â€¢ {rec.priority} â€¢ {rec.affectedStudents} students
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {showCreateChooser && (
        <div className="ui-modal-backdrop">
          <div className="ui-modal max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create Assignment</h3>
              <button onClick={() => setShowCreateChooser(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3">
              <Link
                to="/lecturer/assignment/ai-create"
                onClick={() => setShowCreateChooser(false)}
                className="px-4 py-3 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 text-center font-medium"
              >
                AI Generated
              </Link>
              <Link
                to="/lecturer/assignment/create"
                onClick={() => setShowCreateChooser(false)}
                className="px-4 py-3 rounded-lg bg-blue-500 text-white hover:bg-blue-600 text-center font-medium"
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
              <h3 className="text-lg font-semibold">Create Classroom</h3>
              <button onClick={() => setShowCreateClassroom(false)} className="text-gray-500 hover:text-gray-700">
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
              className="w-full mt-3 px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              {creatingClassroom ? "Creating..." : "Generate class code"}
            </button>
          </div>
        </div>
      )}

      {rosterClassroomId && (
        <div className="ui-modal-backdrop">
          <div className="ui-modal max-w-3xl max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Classroom Roster</h3>
              <button onClick={() => setRosterClassroomId(null)} className="text-gray-500 hover:text-gray-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            {(roster ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No students in roster yet.</p>
            ) : (
              <div className="space-y-2">
                {(roster ?? []).map((row) => (
                  <div key={row.studentId} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900">{row.fullName}</p>
                      <p className="text-xs text-gray-500">Attempts: {row.assignmentsAttempted}</p>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      Avg CIS: <span className="font-semibold">{row.avgCis}</span> | Avg Independence: <span className="font-semibold">{row.avgIndependence}%</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Trend: {row.trend.length > 0 ? row.trend.join(" â†’ ") : "No trend yet"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function InterventionButton({
  label,
  value,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  tone: "danger" | "warn" | "info" | "good";
  onClick: () => void;
}) {
  const toneClass: Record<typeof tone, string> = {
    danger: "border-red-200 bg-red-50 text-red-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-indigo-200 bg-indigo-50 text-indigo-900",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg shadow-sm border p-5 text-left transition-all ${toneClass[tone]} ${
        active ? "ring-2 ring-slate-300" : "hover:shadow-md"
      }`}
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </button>
  );
}

function ClassroomCard({
  classroom,
  onCopyCode,
  onRename,
  onArchiveToggle,
  onDelete,
  onViewRoster,
}: {
  classroom: { _id: string; name: string; subject?: "Physics" | "Chemistry" | "Math"; batchName?: string; joinCode: string; studentCount: number; isActive: boolean };
  onCopyCode: () => void;
  onRename: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
  onViewRoster: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="border rounded-lg p-4 relative">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-gray-900">{classroom.name}</p>
          {!classroom.isActive && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
              Archived
            </span>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="h-8 w-8 rounded-xl hover:bg-[var(--color-surface-soft)] inline-flex items-center justify-center transition-colors"
          >
            <MoreVertical className="h-4 w-4 text-gray-600" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRename();
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-surface-soft)]"
              >
                Edit classroom
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onCopyCode();
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-surface-soft)]"
              >
                Copy code
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onArchiveToggle();
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-surface-soft)]"
              >
                {classroom.isActive ? "Archive" : "Restore"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                Delete classroom
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Code: <span className="font-semibold tracking-wide">{classroom.joinCode}</span>
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
        <p className="text-xs text-gray-500 mt-1">
          {[classroom.subject, classroom.batchName].filter(Boolean).join(" Â· ")}
        </p>
      )}
      <p className="text-xs text-gray-500 mt-2">{classroom.studentCount} students joined</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          to={`/lecturer/assignment/create?classroomId=${classroom._id}`}
          className="text-center px-3 py-2 rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 text-sm"
        >
          Manual
        </Link>
        <Link
          to={`/lecturer/assignment/ai-create?classroomId=${classroom._id}`}
          className="text-center px-3 py-2 rounded-md bg-indigo-100 text-indigo-700 hover:bg-indigo-200 text-sm"
        >
          AI
        </Link>
        <button
          type="button"
          onClick={onViewRoster}
          className="col-span-2 text-center px-3 py-2 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm"
        >
          View Roster
        </button>
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
  onIntervene,
}: {
  assignment: LecturerAssignment;
  classroomName?: string;
  toggling: boolean;
  deleting: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onIntervene: () => void;
}) {
  const displayTitle = assignment.title.trim() || "Untitled Assignment";
  const subtitleParts = [assignment.subject, assignment.chapter, assignment.difficulty].filter(Boolean);
  const getStatusBadge = () => {
    if (assignment.isActive) {
      return <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">Active</span>;
    }
    return <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">Draft</span>;
  };

  const getIndependenceColor = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <div className="app-surface-card p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{displayTitle}</h3>
            {getStatusBadge()}
            {!assignment.title.trim() && (
              <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium">
                Untitled
              </span>
            )}
          </div>
          {classroomName && <p className="text-xs text-indigo-700 mb-2">Classroom: {classroomName}</p>}
          {subtitleParts.length > 0 && (
            <p className="text-xs text-gray-500 mb-2">{subtitleParts.join(" Â· ")}</p>
          )}

          {assignment.description && <p className="text-gray-600 mb-3 line-clamp-2">{assignment.description}</p>}

          <div className="flex items-center gap-6 text-sm text-gray-500">
            <span>{assignment.questionCount} questions</span>
            <span>{assignment.studentsAttempted} students attempted</span>
            <span>{assignment.studentsCompleted} completed</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="text-right">
            <p className="text-sm text-gray-600">Avg Independence Score</p>
            {assignment.studentsAttempted > 0 && assignment.avgIndependenceScore === 0 ? (
              <p className="text-sm text-gray-500">Calculating...</p>
            ) : (
              <p className={`text-2xl font-bold ${getIndependenceColor(assignment.avgIndependenceScore)}`}>
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
            className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-sm"
          >
            <BarChart3 className="h-4 w-4 mr-1" />
            View Analytics
          </Link>
          <Link
            to={`/lecturer/assignment/${assignment._id}/live`}
            className="inline-flex items-center px-3 py-1 bg-emerald-100 text-emerald-700 rounded-md hover:bg-emerald-200 transition-colors text-sm"
          >
            View Live Session
          </Link>

          <button
            onClick={onEdit}
            className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
          >
            Edit
          </button>
          <button
            onClick={onIntervene}
            className="inline-flex items-center px-3 py-1 bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 transition-colors text-sm"
          >
            Intervene
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex items-center px-3 py-1 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-sm disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>

        <button
          onClick={onToggle}
          disabled={toggling}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          {toggling ? "Updating..." : assignment.isActive ? "Deactivate" : "Activate"}
        </button>
      </div>
    </div>
  );
}

