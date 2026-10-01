import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Link, useParams } from "react-router-dom";
import { BookOpen, CheckCircle, Play, RotateCcw, ArrowLeft, ArrowRight, Brain } from "lucide-react";
import { useMemo } from "react";

interface StudentAssignment {
  _id: Id<"assignments">;
  _creationTime: number;
  lecturerId: Id<"users">;
  classroomId?: Id<"classrooms">;
  title: string;
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

export function StudentClassroom() {
  const { classroomId } = useParams<{ classroomId: string }>();
  const anyApi = api as any;

  // Fetch data
  const assignments = useQuery(api.assignments.getStudentAssignments);
  const classrooms = useQuery(anyApi.classrooms.getStudentClassrooms);

  const classroom = useMemo(
    () => classrooms?.find((c: any) => c._id === classroomId),
    [classrooms, classroomId],
  );

  const classroomAssignments = useMemo(() => {
    if (!assignments) return [];
    return assignments.filter((a: any) => a.classroomId === classroomId);
  }, [assignments, classroomId]);

  if (classrooms === undefined || assignments === undefined) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-48 bg-white/20 rounded-3xl" />
        <div className="space-y-4">
          <div className="h-16 bg-white/20 rounded-xl" />
          <div className="h-16 bg-white/20 rounded-xl" />
          <div className="h-16 bg-white/20 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!classroom) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center space-y-4">
        <h2 className="text-2xl font-bold text-white/80">Classroom not found</h2>
        <p className="text-white/50">You may not be enrolled, or this classroom has been deleted.</p>
        <Link to="/student/dashboard" className="text-sky-600 hover:text-sky-700 font-medium inline-flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const completed = classroomAssignments.filter((a) => a.status === "completed");
  const pending = classroomAssignments.filter((a) => a.status !== "completed");

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-sky-600 to-cyan-500 p-8 md:p-10 text-white min-h-[16rem] flex flex-col justify-end shadow-lg">
        {/* Abstract shapes for visual interest */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-[rgba(255,255,255,0.06)]/10 blur-3xl mix-blend-overlay" />
        <div className="absolute bottom-0 left-10 w-48 h-48 rounded-full bg-cyan-400/20 blur-2xl mix-blend-overlay" />
        
        <div className="relative z-10 flex items-start justify-between w-full">
          <div>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-2">
              {classroom.name}
            </h1>
            <p className="text-cyan-50 opacity-90 text-lg">
              Class code: <span className="font-mono bg-black/20 px-2 py-0.5 rounded tracking-widest text-sm">{classroom.joinCode}</span>
            </p>
          </div>
          <Link 
            to="/student/dashboard"
            className="flex items-center gap-2 bg-black/20 hover:bg-black/30 text-white px-4 py-2 rounded-xl backdrop-blur-sm transition-colors text-sm font-medium"
          >
             <ArrowLeft className="w-4 h-4" />
             Dashboard
          </Link>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Main Content: Assignments */}
        <div className="flex-1 space-y-8">
          
          {/* Action-Needed Segment */}
          <div>
            <h2 className="text-xl font-bold text-white/80 mb-4 flex items-center gap-2">
              To Do
              <span className="bg-sky-100 text-sky-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                {pending.length}
              </span>
            </h2>
            
            {pending.length === 0 ? (
              <div className="rounded-2xl border border-[var(--color-border)] border-dashed bg-[rgba(255,255,255,0.04)] p-8 flex flex-col items-center justify-center text-center">
                <div className="bg-[rgba(255,255,255,0.06)] p-3 rounded-full shadow-sm mb-3">
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                </div>
                <h3 className="font-semibold text-white/70">All caught up!</h3>
                <p className="text-sm text-white/50 mt-1 max-w-[250px]">You have completed all active assignments in this classroom.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((assignment) => (
                  <AssignmentRow key={assignment._id} assignment={assignment as StudentAssignment} />
                ))}
              </div>
            )}
          </div>

          {/* Completed Segment */}
          {completed.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-white/80 mb-4 flex items-center gap-2">
                Completed
                 <span className="bg-[rgba(255,255,255,0.08)] text-white/60 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                  {completed.length}
                </span>
              </h2>
              <div className="space-y-3">
                {completed.map((assignment) => (
                  <AssignmentRow key={assignment._id} assignment={assignment as StudentAssignment} />
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Sidebar */}
        <div className="w-full lg:w-72 space-y-6">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.06)] p-5 shadow-sm">
            <h3 className="font-semibold text-white/80 mb-3 text-sm uppercase tracking-wider">Class Info</h3>
            <div className="space-y-4">
              <div>
                 <p className="text-xs text-white/50 uppercase font-medium">Joined In</p>
                 <p className="text-sm font-medium text-white/70 mt-0.5">
                   {new Date(classroom.joinedAt).toLocaleDateString()}
                 </p>
              </div>
              <div>
                 <p className="text-xs text-white/50 uppercase font-medium">Total Assignments</p>
                 <p className="text-sm font-medium text-white/70 mt-0.5">
                   {classroomAssignments.length}
                 </p>
              </div>
            </div>
            <Link
              to="/student/analytics"
              className="mt-6 w-full flex items-center justify-center gap-2 bg-sky-50 hover:bg-sky-100 text-sky-700 font-medium py-2.5 rounded-xl transition-colors text-sm"
            >
              <Brain className="w-4 h-4" />
              View Full Analytics
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------
// Assignment HTML Row
// -------------------------------------------------------------------
function AssignmentRow({ assignment }: { assignment: StudentAssignment }) {
  const isCompleted = assignment.status === "completed";
  const isInProgress = assignment.status === "in_progress";

  const getTargetUrl = () => {
    if (isCompleted) {
      return `/student/assignment/${assignment._id}/results`;
    }
    return `/student/assignment/${assignment._id}/question/1`;
  };

  return (
    <Link
      to={getTargetUrl()}
      className="group flex flex-col sm:flex-row sm:items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.06)] p-4 hover:border-sky-300 hover:shadow-md transition-all duration-200"
    >
      {/* Icon block based on status */}
      <div className={`shrink-0 rounded-xl p-3 flex items-center justify-center ${
        isCompleted 
          ? "bg-[rgba(255,255,255,0.08)] text-white/40 group-hover:bg-white/20 group-hover:text-white/60" 
          : "bg-sky-100 text-sky-600 group-hover:bg-sky-500 group-hover:text-white"
      } transition-colors`}>
        {isCompleted ? <CheckCircle className="w-6 h-6" /> : <BookOpen className="w-6 h-6" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className={`text-base font-semibold truncate ${isCompleted ? 'text-white/60' : 'text-white'}`}>
            {assignment.title}
          </h3>
          {assignment.isDeepDive && (
             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 border border-violet-200 text-violet-800 text-[10px] font-bold uppercase tracking-wider shrink-0">
                {"🔬"} Deep Dive
             </span>
          )}
        </div>
        
        <div className="flex items-center gap-3 mt-1.5 text-xs text-white/50">
          <span>{assignment.totalQuestions} questions</span>
          <span className="w-1 h-1 rounded-full bg-white/30" />
          <span>{assignment.timeLimitMinutes} mins</span>
          
          {isInProgress && (
             <>
               <span className="w-1 h-1 rounded-full bg-white/30" />
               <span className="font-medium text-orange-600 flex items-center gap-1">
                 <RotateCcw className="w-3 h-3" />
                 {assignment.progress} completed
               </span>
             </>
          )}

          {isCompleted && assignment.avgScore > 0 && (
             <>
               <span className="w-1 h-1 rounded-full bg-white/30" />
               <span className="font-medium text-emerald-600">
                 Score: {assignment.avgScore}%
               </span>
             </>
          )}
        </div>
      </div>

      {/* Action CTA */}
      <div className="shrink-0 flex items-center justify-end">
         <div className={`p-2 rounded-full transition-colors ${
            isCompleted 
              ? "bg-[rgba(255,255,255,0.08)] text-white/40 group-hover:bg-white/20 group-hover:text-white/60"
              : "bg-sky-50 text-sky-600 group-hover:bg-sky-100"
         }`}>
           {isCompleted ? <ArrowRight className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
         </div>
      </div>
    </Link>
  );
}
