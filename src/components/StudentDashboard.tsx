import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { Clock, BookOpen, CheckCircle, Play, RotateCcw, MoreVertical, ChevronDown, ChevronUp, Brain } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";

const HIDDEN_ASSIGNMENTS_KEY = "cogait_hidden_assignments_v1";
const PINNED_ASSIGNMENTS_KEY = "cogait_pinned_assignments_v1";

function loadStringArray(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function persistStringArray(key: string, values: string[]) {
  window.localStorage.setItem(key, JSON.stringify(values));
}

interface StudentAssignment {
  _id: Id<"assignments">;
  _creationTime: number;
  lecturerId: Id<"users">;
  classroomId?: Id<"classrooms">;
  title: string;
  description?: string;
  timeLimitMinutes: number;
  totalQuestions: number;
  allowedLevels: number[];
  isActive: boolean;
  publishedAt?: number;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  avgScore: number;
}

interface JoinedClassroom {
  _id: Id<"classrooms">;
  name: string;
  joinCode: string;
  joinedAt: number;
}

export function StudentDashboard() {
  const anyApi = api as any;
  const assignments = useQuery(api.assignments.getStudentAssignments);
  const joinedClassrooms = useQuery(anyApi.classrooms.getStudentClassrooms) as
    | JoinedClassroom[]
    | undefined;
  const timeline = useQuery(anyApi.attempts.getStudentCognitiveTimeline) as
    | Array<{
        assignmentId: string;
        title: string;
        status: "not_started" | "in_progress" | "submitted";
        activeMinutes: number;
        helpRequests: number;
        completedQuestions: number;
        totalQuestions: number;
        lastActivityAt: number;
      }>
    | undefined;
  const decisionBar = useQuery(anyApi.attempts.getStudentDecisionBar) as
    | {
        activeAssignmentTitle: string | null;
        remainingSeconds: number | null;
        independenceScore: number;
        riskLevel: "low" | "medium" | "high";
        highAiUsage: boolean;
      }
    | undefined;
  const unenrollFromClass = useMutation(anyApi.classrooms.unenrollFromClass);
  const user = useQuery(api.users.loggedInUserWithProfile);
  const [activeFilter, setActiveFilter] = useState<"all" | "completed" | "in_progress">("all");
  const [hiddenAssignmentIds, setHiddenAssignmentIds] = useState<string[]>([]);
  const [pinnedAssignmentIds, setPinnedAssignmentIds] = useState<string[]>([]);
  const [unenrollingClassroomId, setUnenrollingClassroomId] = useState<string | null>(null);
  const resolvedAssignments = assignments ?? [];
  const hiddenCount = hiddenAssignmentIds.length;
  const remainingSeconds = decisionBar?.remainingSeconds ?? null;

  useEffect(() => {
    setHiddenAssignmentIds(loadStringArray(HIDDEN_ASSIGNMENTS_KEY));
    setPinnedAssignmentIds(loadStringArray(PINNED_ASSIGNMENTS_KEY));
  }, []);

  const filteredAssignments = useMemo(() => {
    const visibleAssignments = resolvedAssignments.filter(
      (assignment) => !hiddenAssignmentIds.includes(assignment._id.toString()),
    );
    const ordered = [...visibleAssignments].sort((a, b) => {
      const aPos = pinnedAssignmentIds.indexOf(a._id.toString());
      const bPos = pinnedAssignmentIds.indexOf(b._id.toString());
      if (aPos === -1 && bPos === -1) {
        return 0;
      }
      if (aPos === -1) {
        return 1;
      }
      if (bPos === -1) {
        return -1;
      }
      return aPos - bPos;
    });
    if (activeFilter === "all") {
      return ordered;
    }
    return ordered.filter((assignment) => assignment.status === activeFilter);
  }, [resolvedAssignments, activeFilter, hiddenAssignmentIds, pinnedAssignmentIds]);

  const handleMoveAssignment = (assignmentId: Id<"assignments">) => {
    const id = assignmentId.toString();
    setPinnedAssignmentIds((prev) => {
      const next = [id, ...prev.filter((entry) => entry !== id)];
      persistStringArray(PINNED_ASSIGNMENTS_KEY, next);
      return next;
    });
    toast.success("Moved to top");
  };

  const handleHideAssignment = (assignmentId: Id<"assignments">) => {
    const id = assignmentId.toString();
    setHiddenAssignmentIds((prev) => {
      const next = prev.includes(id) ? prev : [...prev, id];
      persistStringArray(HIDDEN_ASSIGNMENTS_KEY, next);
      return next;
    });
    toast.success("Class hidden");
  };

  const restoreHiddenAssignments = () => {
    setHiddenAssignmentIds([]);
    persistStringArray(HIDDEN_ASSIGNMENTS_KEY, []);
    toast.success("Hidden classes restored");
  };

  const handleUnenroll = async (assignment: StudentAssignment) => {
    if (!assignment.classroomId) {
      toast.error("This assignment is not linked to a classroom.");
      return;
    }
    await handleUnenrollFromClassroom(assignment.classroomId);
  };

  const handleUnenrollFromClassroom = async (classroomId: Id<"classrooms">) => {
    const confirmed = window.confirm("Unenroll from this classroom?");
    if (!confirmed) {
      return;
    }
    try {
      setUnenrollingClassroomId(classroomId.toString());
      await unenrollFromClass({ classroomId });
      toast.success("Unenrolled from classroom");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not unenroll";
      toast.error(message);
    } finally {
      setUnenrollingClassroomId(null);
    }
  };

  const hiddenAssignments = useMemo(
    () =>
      hiddenAssignmentIds
        .map((id) => resolvedAssignments.find((assignment) => assignment._id.toString() === id))
        .filter((assignment): assignment is StudentAssignment => Boolean(assignment)),
    [hiddenAssignmentIds, resolvedAssignments],
  );

  const staleHiddenCount = hiddenCount - hiddenAssignments.length;

  const restoreHiddenAssignment = (assignmentId: Id<"assignments">) => {
    const id = assignmentId.toString();
    setHiddenAssignmentIds((prev) => {
      const next = prev.filter((entry) => entry !== id);
      persistStringArray(HIDDEN_ASSIGNMENTS_KEY, next);
      return next;
    });
    toast.success("Class restored");
  };

  const clearStaleHidden = () => {
    setHiddenAssignmentIds((prev) => {
      const activeIds = new Set(resolvedAssignments.map((assignment) => assignment._id.toString()));
      const next = prev.filter((entry) => activeIds.has(entry));
      persistStringArray(HIDDEN_ASSIGNMENTS_KEY, next);
      return next;
    });
    toast.success("Hidden list updated");
  };

  if (assignments === undefined) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 bg-gray-200 rounded-2xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <DecisionTile
          label="Active Assignment"
          value={decisionBar?.activeAssignmentTitle ?? "No active assignment"}
          tone="neutral"
        />
        <DecisionTile
          label={(remainingSeconds ?? 0) < 0 ? "Extra Time" : "Time Left"}
          value={
            remainingSeconds === null
              ? "--:--"
              : `${Math.floor(Math.abs(remainingSeconds) / 60)}:${(Math.abs(remainingSeconds) % 60).toString().padStart(2, "0")}`
          }
          tone={(remainingSeconds ?? 0) < 0 ? "danger" : "neutral"}
        />
        <CombinedRiskTile decisionBar={decisionBar} />
      </div>

      <div className="rounded-3xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 p-6 md:p-8 text-white shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm/6 text-white/80 mb-1">Student Workspace</p>
            <h1 className="text-2xl md:text-4xl font-semibold tracking-tight">
              {user?.profile?.fullName}
            </h1>
            <p className="text-sm md:text-base text-white/90 mt-2">
              Access your classes, continue pending work, and track completed assignments.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link
              to="/student/analytics"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-white/20 border border-white/40 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/30 transition-colors"
            >
              <Brain className="h-4 w-4 mr-2" />
              View AI Analytics
            </Link>
            <Link
              to="/student/join-class"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-50 transition-colors"
            >
              Join with class code
            </Link>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip
          label="All"
          active={activeFilter === "all"}
          onClick={() => setActiveFilter("all")}
        />
        <FilterChip
          label="In Progress"
          active={activeFilter === "in_progress"}
          onClick={() => setActiveFilter("in_progress")}
        />
        <FilterChip
          label="Completed"
          active={activeFilter === "completed"}
          onClick={() => setActiveFilter("completed")}
        />
      </div>

      <div className="ui-card p-5">
        <h2 className="app-section-title text-lg">Joined Classrooms</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Manage your class enrollments directly from here.
        </p>
        <div className="mt-4 space-y-3">
          {joinedClassrooms === undefined ? (
            <p className="text-sm text-[var(--color-text-muted)]">Loading classrooms...</p>
          ) : joinedClassrooms.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">You have not joined any classrooms yet.</p>
          ) : (
            joinedClassrooms.map((classroom) => (
              <div
                key={classroom._id}
                className="rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50/30 to-sky-50/30 p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-medium text-[var(--color-text)]">{classroom.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">Code: {classroom.joinCode}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleUnenrollFromClassroom(classroom._id)}
                  disabled={unenrollingClassroomId === classroom._id.toString()}
                  className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-60 text-sm"
                >
                  {unenrollingClassroomId === classroom._id.toString() ? "Unenrolling..." : "Unenroll"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {hiddenCount > 0 && (
        <div className="app-surface-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-[var(--color-text)]">Hidden classes</p>
              <p className="text-sm text-[var(--color-text-muted)]">{hiddenCount} hidden from dashboard.</p>
            </div>
            <button
              type="button"
              onClick={restoreHiddenAssignments}
              className="px-3 py-1.5 rounded-lg bg-cyan-100 text-cyan-800 hover:bg-cyan-200 text-sm"
            >
              Restore all
            </button>
          </div>

          {hiddenAssignments.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {hiddenAssignments.map((assignment) => (
                <div
                  key={assignment._id}
                  className="rounded-lg border border-cyan-100 bg-white px-3 py-2 flex items-center justify-between gap-2"
                >
                  <p className="text-sm text-[var(--color-text)] truncate">{assignment.title}</p>
                  <button
                    type="button"
                    onClick={() => restoreHiddenAssignment(assignment._id)}
                    className="text-xs px-2 py-1 rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}

          {staleHiddenCount > 0 && (
            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              <p>{staleHiddenCount} hidden item(s) are no longer available.</p>
              <button
                type="button"
                onClick={clearStaleHidden}
                className="px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
              >
                Clean up
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="app-section-title">Your Classes</h2>

        {filteredAssignments.length === 0 ? (
          <div className="app-surface-card p-8 text-center">
            <BookOpen className="h-12 w-12 text-cyan-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">
              {activeFilter === "all" ? "No assignments yet" : "No assignments in this filter"}
            </h3>
            <p className="text-[var(--color-text-muted)]">
              {activeFilter === "all"
                ? "Check back later for new assignments from your lecturers."
                : "Try selecting another status filter."}
            </p>
            {activeFilter === "all" && (
              <Link
                to="/student/join-class"
                className="inline-flex mt-4 items-center justify-center px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors"
              >
                Join a class with code
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {(() => {
              const byClassroom = new Map<string, StudentAssignment[]>();
              filteredAssignments.forEach((a) => {
                const cId = a.classroomId ? a.classroomId.toString() : "general";
                if (!byClassroom.has(cId)) byClassroom.set(cId, []);
                byClassroom.get(cId)!.push(a);
              });

              return Array.from(byClassroom.entries()).map(([cId, classAssignments]) => {
                const classroom = cId !== "general" ? joinedClassrooms?.find(c => c._id === cId) : null;
                const title = classroom ? classroom.name : "General Assignments";
                
                return (
                  <div key={cId} className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4 border-b border-sky-50 pb-2">
                       <BookOpen className="h-5 w-5 text-cyan-600" />
                       <h3 className="text-lg font-bold text-sky-950">{title}</h3>
                       <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                         {classAssignments.length} Assignments
                       </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {classAssignments.map((assignment, index) => (
                        <AssignmentCard
                          key={assignment._id}
                          assignment={assignment}
                          colorIndex={index}
                          onMove={() => handleMoveAssignment(assignment._id)}
                          onHide={() => handleHideAssignment(assignment._id)}
                          onUnenroll={() => void handleUnenroll(assignment)}
                          canUnenroll={Boolean(assignment.classroomId)}
                        />
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      <div className="ui-card p-5">
        <h2 className="app-section-title text-lg">Cognitive Timeline</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Recent work rhythm: help usage, active minutes, and progress.</p>
        <div className="mt-4 space-y-3">
          {(timeline ?? []).length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No timeline data yet.</p>
          ) : (
            (timeline ?? []).map((item) => (
              <div key={item.assignmentId} className="rounded-xl border border-cyan-100 bg-gradient-to-r from-cyan-50/40 to-sky-50/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-[var(--color-text)] line-clamp-1">{item.title}</p>
                  <span className="text-xs px-2 py-1 rounded-full bg-sky-100 text-sky-800">
                    {item.status}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[var(--color-text-muted)]">
                  <div>Active: <span className="font-semibold">{item.activeMinutes} min</span></div>
                  <div>Help: <span className="font-semibold">{item.helpRequests}</span></div>
                  <div>Progress: <span className="font-semibold">{item.completedQuestions}/{item.totalQuestions}</span></div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CombinedRiskTile({ decisionBar }: { decisionBar: any }) {
  const [open, setOpen] = useState(false);
  
  const riskValue = decisionBar?.highAiUsage ? "High AI Usage" : (decisionBar?.riskLevel ?? "low").toUpperCase();
  const riskTone = decisionBar?.riskLevel === "high" || decisionBar?.highAiUsage ? "danger" : decisionBar?.riskLevel === "medium" ? "warn" : "good";
  
  const indValue = `${decisionBar?.independenceScore ?? 0}%`;
  const indTone = (decisionBar?.independenceScore ?? 0) < 40 ? "danger" : (decisionBar?.independenceScore ?? 0) < 60 ? "warn" : "good";

  const toneMap: Record<string, string> = {
    neutral: "border-sky-200 bg-gradient-to-br from-sky-50 to-white text-sky-950",
    good: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-900",
    warn: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-900",
    danger: "border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 text-rose-900",
  };

  return (
    <div className="relative h-full flex flex-col items-stretch z-10 w-full">
      <div 
        className={`rounded-2xl border p-4 ${toneMap[riskTone]} cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all flex w-full relative z-20`}
        onClick={() => setOpen(!open)}
      >
        <div className="flex justify-between items-start w-full">
          <div>
            <p className="text-xs uppercase tracking-wide opacity-70">Risk Signal</p>
            <p className="mt-2 text-lg font-semibold line-clamp-1">{riskValue}</p>
          </div>
          <div className="opacity-50 mt-1">
             {open ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
          </div>
        </div>
      </div>

      <div 
        className={`absolute top-full left-0 right-0 z-10 transition-all duration-300 ease-in-out overflow-hidden shadow-xl rounded-2xl bg-white border ${open ? 'max-h-40 opacity-100 mt-2 pointer-events-auto' : 'max-h-0 opacity-0 pointer-events-none mt-0 border-transparent shadow-none'}`}
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex-1 pr-4 border-r border-sky-100/50">
            <p className="text-[10px] uppercase tracking-wide text-rose-900/60 font-semibold">Risk Signal</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{riskValue}</p>
          </div>
          <div className="flex-1 pl-4 text-right">
            <p className="text-[10px] uppercase tracking-wide text-emerald-900/60 font-semibold">Live Independence</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{indValue}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionTile({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn" | "danger";
  onClick?: () => void;
}) {
  const toneMap: Record<typeof tone, string> = {
    neutral: "border-sky-200 bg-gradient-to-br from-sky-50 to-white text-sky-950",
    good: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-900",
    warn: "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-900",
    danger: "border-rose-200 bg-gradient-to-br from-rose-50 to-pink-50 text-rose-900",
  };
  return (
    <div 
      className={`rounded-2xl border p-4 ${toneMap[tone]} ${onClick ? 'cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all' : ''}`}
      onClick={onClick}
    >
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-lg font-semibold line-clamp-1">{value}</p>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
        active
          ? "bg-gradient-to-r from-sky-600 to-cyan-500 text-white border-cyan-500"
          : "bg-white text-[var(--color-text-muted)] border-sky-100 hover:border-sky-300"
      }`}
    >
      {label}
    </button>
  );
}

function AssignmentCard({
  assignment,
  colorIndex,
  onMove,
  onHide,
  onUnenroll,
  canUnenroll,
}: {
  assignment: StudentAssignment;
  colorIndex: number;
  onMove: () => void;
  onHide: () => void;
  onUnenroll: () => void;
  canUnenroll: boolean;
}) {
  const displayTitle = assignment.title.trim() || "Untitled Assignment";
  const [menuOpen, setMenuOpen] = useState(false);
  const headerPalette = [
    "from-sky-600 to-blue-500",
    "from-emerald-600 to-teal-500",
    "from-indigo-600 to-violet-500",
    "from-amber-600 to-orange-500",
    "from-fuchsia-600 to-pink-500",
  ];
  const headerClass = headerPalette[colorIndex % headerPalette.length];

  const getStatusColor = (status: StudentAssignment["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in_progress":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-sky-100 text-sky-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed": return "Completed";
      case "in_progress": return "In Progress";
      default: return "Not Started";
    }
  };

  const getActionButton = () => {
    switch (assignment.status) {
      case "completed":
        return (
          <Link
            to={`/student/assignment/${assignment._id}/results`}
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            View Results
          </Link>
        );
      case "in_progress":
        return (
          <Link
            to={`/student/assignment/${assignment._id}/question/1`}
            className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Continue
          </Link>
        );
      default:
        return (
          <Link
            to={`/student/assignment/${assignment._id}/question/1`}
            className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
          >
            <Play className="h-4 w-4 mr-2" />
            Start Assignment
          </Link>
        );
    }
  };

  return (
    <div className="relative app-surface-card overflow-hidden hover:shadow-md transition-shadow">
      <div className={`bg-gradient-to-r ${headerClass} p-4 min-h-28 text-white`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold line-clamp-2">{displayTitle}</h3>
          <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(assignment.status)}`}>
            {getStatusText(assignment.status)}
          </span>
        </div>
        <p className="mt-2 text-sm text-white/85 line-clamp-2">
          {assignment.description?.trim() || "Practice set published by your lecturer."}
        </p>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex items-center gap-4 text-sm text-[var(--color-text-muted)]">
          <span className="flex items-center">
            <BookOpen className="h-4 w-4 mr-1" />
            {assignment.totalQuestions} questions
          </span>
          <span className="flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            {assignment.timeLimitMinutes} min
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[var(--color-text-subtle)] mb-1">
            <span>Progress</span>
            <span>{assignment.progress}/{assignment.totalQuestions}</span>
          </div>
          <div className="h-2 rounded-full bg-sky-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-cyan-500"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, assignment.totalQuestions > 0 ? (assignment.progress / assignment.totalQuestions) * 100 : 0),
                )}%`,
              }}
            />
          </div>
        </div>

        {assignment.status === "completed" && assignment.avgScore > 0 && (
          <p className="text-sm font-medium text-emerald-700">Score: {assignment.avgScore}%</p>
        )}

        <div className="pt-1 flex items-center justify-between">
          {getActionButton()}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="h-9 w-9 rounded-full hover:bg-sky-100 inline-flex items-center justify-center"
              aria-label="Class options"
            >
              <MoreVertical className="h-4 w-4 text-[var(--color-text-muted)]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-10 w-40 bg-white border border-sky-200 rounded-lg shadow-lg py-1 z-20">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onMove();
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50"
                >
                  Move
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onHide();
                  }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50"
                >
                  Hide
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onUnenroll();
                  }}
                  disabled={!canUnenroll}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50 disabled:opacity-40"
                >
                  {canUnenroll ? "Unenroll" : "Unenroll unavailable"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


