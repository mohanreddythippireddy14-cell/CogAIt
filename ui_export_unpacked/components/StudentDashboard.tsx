import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Link } from "react-router-dom";
import { Clock, BookOpen, CheckCircle, Play, RotateCcw, MoreVertical, ChevronDown, ChevronUp, Brain, ArrowRight } from "lucide-react";
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
  organizationId: Id<"organizations">;
  lecturerId: Id<"users">;
  classroomId?: Id<"classrooms">;
  title: string;
  subject?: "Physics" | "Chemistry" | "Math";
  chapter?: string;
  description?: string;
  timeLimitMinutes: number;
  totalQuestions: number;
  allowedLevels?: number[];
  isActive: boolean;
  publishedAt?: number;
  status: "not_started" | "in_progress" | "completed";
  progress: number;
  avgScore: number;
  // Deep-dive fields
  isDeepDive?: boolean;
  targetStudentId?: Id<"users">;
  sourceAssignmentId?: Id<"assignments">;
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
          <div className="h-8 rounded w-1/3 bg-white/5"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 rounded-2xl bg-white/5"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* ── Decision Widgets Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <DecisionTile
          label="Active Assignment"
          value={decisionBar?.activeAssignmentTitle ?? "No active assignment"}
          tone="neutral"
          stagger={1}
        />
        <DecisionTile
          label={(remainingSeconds ?? 0) < 0 ? "Extra Time" : "Time Left"}
          value={
            remainingSeconds === null
              ? "--:--"
              : `${Math.floor(Math.abs(remainingSeconds) / 60)}:${(Math.abs(remainingSeconds) % 60).toString().padStart(2, "0")}`
          }
          tone={(remainingSeconds ?? 0) < 0 ? "danger" : "neutral"}
          stagger={2}
        />
        <CombinedRiskTile decisionBar={decisionBar} />
      </div>

      {/* ── Hero Banner ── */}
      <div className="spatial-widget widget-purple p-6 md:p-8 spatial-enter spatial-stagger-2 relative overflow-hidden">
        {/* Ambient dots inside hero */}
        <div className="ambient-dots rounded-[16px]" />
        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="widget-label mb-2">Student Workspace</p>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-white">
              {user?.profile?.fullName}
            </h1>
            <p className="text-sm md:text-base text-white/60 mt-2">
              Access your classes, continue pending work, and track completed assignments.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <Link
              to="/student/analytics"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-white/10 border border-white/20 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-all backdrop-blur-sm"
            >
              <Brain className="h-4 w-4 mr-2" />
              View AI Analytics
            </Link>
            <Link
              to="/student/join-class"
              className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-white/90 px-4 py-2.5 text-sm font-medium text-[#0a0a0f] hover:bg-white transition-all"
            >
              Join with class code
            </Link>
          </div>
        </div>
      </div>

      {/* ── Classrooms Section ── */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
        <h2 className="app-section-title text-xl m-0">Your Classrooms</h2>
        <Link
          to="/student/join-class"
          className="inline-flex items-center text-sm font-medium text-[var(--color-primary-solid)] hover:text-[var(--color-primary-hover)] hover:bg-[rgba(72,32,220,0.1)] px-3 py-1.5 rounded-lg transition-colors"
        >
          + Join Class
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {joinedClassrooms === undefined ? (
          Array.from({ length: 4 }).map((_, i) => (
             <div key={i} className="h-64 rounded-2xl bg-white/5 animate-pulse border border-[var(--color-border)]" />
          ))
        ) : joinedClassrooms.length === 0 ? (
          <div className="col-span-full spatial-widget p-12 text-center flex flex-col items-center justify-center spatial-enter spatial-stagger-4">
             <BookOpen className="h-12 w-12 text-white/20 mb-4" />
             <h3 className="text-xl font-medium text-white mb-2">No classrooms yet</h3>
             <p className="text-white/50 mb-6 max-w-md mx-auto">
               Join a classroom using the code provided by your teacher to access your assignments and AI practice sessions.
             </p>
             <Link
               to="/student/join-class"
               className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] transition-all font-medium shadow-[0_8px_20px_rgba(72,32,220,0.35)]"
             >
               Join a Classroom
             </Link>
          </div>
        ) : (
          joinedClassrooms.map((classroom, index) => (
            <ClassroomCard 
               key={classroom._id} 
               classroom={classroom} 
               colorIndex={index} 
               onUnenroll={() => void handleUnenrollFromClassroom(classroom._id)}
               isUnenrolling={unenrollingClassroomId === classroom._id.toString()}
               stagger={index + 3}
            />
          ))
        )}
      </div>

      {/* ── Cognitive Timeline Widget ── */}
      <div className="spatial-widget widget-dark p-5 spatial-enter spatial-stagger-6 relative">
        <div className="ambient-dots rounded-[16px]" style={{ opacity: 0.15 }} />
        <div className="relative z-10">
          <h2 className="app-section-title text-lg">Cognitive Timeline</h2>
          <p className="text-sm text-white/40 mt-1">Recent work rhythm: help usage, active minutes, and progress.</p>
          <div className="mt-4 space-y-3">
            {(timeline ?? []).length === 0 ? (
              <p className="text-sm text-white/40">No timeline data yet.</p>
            ) : (
              (timeline ?? []).map((item) => (
                <div key={item.assignmentId} className="rounded-xl border border-[rgba(72,32,220,0.25)] bg-[rgba(72,32,220,0.08)] p-3 backdrop-blur-sm transition-all hover:border-[rgba(72,32,220,0.4)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-white line-clamp-1">{item.title}</p>
                    <span className="text-xs px-2 py-1 rounded-full bg-[rgba(72,32,220,0.2)] text-[rgba(255,255,255,0.7)] border border-[rgba(72,32,220,0.3)]">
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/50">
                    <div>Active: <span className="font-semibold text-white/80">{item.activeMinutes} min</span></div>
                    <div>Help: <span className="font-semibold text-white/80">{item.helpRequests}</span></div>
                    <div>Progress: <span className="font-semibold text-white/80">{item.completedQuestions}/{item.totalQuestions}</span></div>
                  </div>
                </div>
              ))
            )}
          </div>
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
    neutral: "border-[rgba(72,32,220,0.3)] bg-[rgba(72,32,220,0.1)]",
    good: "border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.1)]",
    warn: "border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.1)]",
    danger: "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)]",
  };

  return (
    <div className="relative h-full flex flex-col items-stretch z-10 w-full spatial-enter spatial-stagger-3">
      <div 
        className={`spatial-widget rounded-2xl border p-4 ${toneMap[riskTone]} cursor-pointer hover:scale-[1.02] transition-all flex w-full relative z-20 backdrop-blur-xl`}
        onClick={() => setOpen(!open)}
      >
        <div className="flex justify-between items-start w-full">
          <div>
            <p className="widget-label">Risk Signal</p>
            <p className="mt-2 text-lg font-semibold line-clamp-1 text-white">{riskValue}</p>
          </div>
          <div className="opacity-50 mt-1">
             {open ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
          </div>
        </div>
      </div>

      <div 
        className={`absolute top-full left-0 right-0 z-10 transition-all duration-300 ease-in-out overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[rgba(20,20,30,0.92)] backdrop-blur-xl ${open ? 'max-h-40 opacity-100 mt-2 pointer-events-auto shadow-float' : 'max-h-0 opacity-0 pointer-events-none mt-0 border-transparent shadow-none'}`}
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex-1 pr-4 border-r border-[var(--color-border)]">
            <p className="widget-label text-[10px]">Risk Signal</p>
            <p className="mt-1 text-sm font-semibold text-white">{riskValue}</p>
          </div>
          <div className="flex-1 pl-4 text-right">
            <p className="widget-label text-[10px]">Live Independence</p>
            <p className="mt-1 text-sm font-semibold text-white">{indValue}</p>
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
  stagger = 1,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "warn" | "danger";
  onClick?: () => void;
  stagger?: number;
}) {
  const toneMap: Record<typeof tone, string> = {
    neutral: "border-[rgba(72,32,220,0.3)] bg-[rgba(72,32,220,0.1)]",
    good: "border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.1)]",
    warn: "border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.1)]",
    danger: "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)]",
  };
  return (
    <div 
      className={`spatial-widget rounded-2xl border p-4 backdrop-blur-xl ${toneMap[tone]} ${onClick ? 'cursor-pointer hover:scale-[1.02] transition-all' : ''} spatial-enter spatial-stagger-${stagger}`}
      onClick={onClick}
    >
      <p className="widget-label">{label}</p>
      <p className="mt-2 text-lg font-semibold line-clamp-1 text-white">{value}</p>
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
      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
        active
          ? "bg-[var(--color-primary)] text-white border-[rgba(72,32,220,0.5)] shadow-[0_0_15px_rgba(72,32,220,0.3)]"
          : "bg-[rgba(255,255,255,0.04)] text-white/50 border-[var(--color-border)] hover:border-[var(--color-border-strong)] hover:text-white/80"
      }`}
    >
      {label}
    </button>
  );
}

function ClassroomCard({
  classroom,
  colorIndex,
  onUnenroll,
  isUnenrolling,
  stagger = 1,
}: {
  classroom: JoinedClassroom;
  colorIndex: number;
  onUnenroll: () => void;
  isUnenrolling: boolean;
  stagger?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const headerPalette = [
    "from-[#4820dc] to-[#7c3aed]",
    "from-[#10b981] to-[#059669]",
    "from-[#6366f1] to-[#8b5cf6]",
    "from-[#f59e0b] to-[#d97706]",
    "from-[#dc2878] to-[#ec4899]",
  ];
  const headerClass = headerPalette[colorIndex % headerPalette.length];

  return (
    <div className={`relative flex flex-col spatial-widget overflow-visible hover:shadow-float-hover transition-all group spatial-enter spatial-stagger-${Math.min(stagger, 8)}`}>
      {/* Card Header (Clickable) */}
      <Link 
        to={`/student/classroom/${classroom._id}`}
        className={`bg-gradient-to-br ${headerClass} p-5 h-36 rounded-t-[16px] text-white relative overflow-hidden flex flex-col justify-end`}
      >
        <div className="relative z-10">
          <h3 className="text-xl font-bold line-clamp-1">{classroom.name}</h3>
          <p className="text-sm opacity-80 mt-1 flex items-center gap-2">
            Class Code: <span className="font-mono bg-black/30 px-1.5 py-0.5 rounded">{classroom.joinCode}</span>
          </p>
        </div>
        {/* Decorative circle */}
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-white/10 blur-xl group-hover:scale-110 transition-transform duration-500" />
      </Link>

      {/* Card Body */}
      <div className="p-4 flex-1 flex flex-col justify-between min-h-[100px] border-t border-[var(--color-border)]">
        <div className="flex items-center gap-2 text-sm text-white/40 mb-4">
          <Clock className="w-4 h-4" />
          <span>Joined {new Date(classroom.joinedAt).toLocaleDateString()}</span>
        </div>

        <div className="flex items-center justify-between mt-auto">
          <Link 
            to={`/student/classroom/${classroom._id}`}
            className="text-sm font-medium text-[var(--color-primary-solid)] hover:text-[var(--color-primary-hover)] flex items-center gap-1 group/link"
          >
            Go to class
            <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
          </Link>
          
          {/* Options Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setMenuOpen((prev) => !prev);
              }}
              className="h-8 w-8 rounded-full hover:bg-white/10 inline-flex items-center justify-center transition-colors"
              aria-label="Class options"
            >
              <MoreVertical className="h-4 w-4 text-white/30" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-full mb-1 w-36 bg-[rgba(20,20,30,0.95)] border border-[var(--color-border)] rounded-xl shadow-float py-1 z-30 backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onUnenroll();
                  }}
                  disabled={isUnenrolling}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[rgba(239,68,68,0.1)] text-red-400 disabled:opacity-50"
                >
                  {isUnenrolling ? "Unenrolling..." : "Unenroll"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


