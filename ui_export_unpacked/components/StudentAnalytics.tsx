import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Link } from "react-router-dom";
import { ChevronLeft, Brain, TrendingUp, TrendingDown, Layers, BookOpen, AlertCircle, Activity, Award } from "lucide-react";
import { useMemo } from "react";

export function StudentAnalytics() {
  const analytics = useQuery((api as any).studentAnalytics.getStudentAnalytics) as any;

  if (analytics === undefined) {
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div className="animate-pulse space-y-8">
          <div className="h-12 bg-[rgba(255,255,255,0.06)] rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64 bg-[rgba(255,255,255,0.06)] rounded-3xl"></div>
            <div className="h-64 bg-[rgba(255,255,255,0.06)] rounded-3xl"></div>
          </div>
          <div className="h-48 bg-[rgba(255,255,255,0.06)] rounded-3xl w-full"></div>
        </div>
      </div>
    );
  }

  // Calculate current trajectory state
  const isDeclining = analytics.longTermTrajectory.length >= 2 && 
      analytics.longTermTrajectory[3].cis < analytics.longTermTrajectory[2].cis;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link to="/student/dashboard" className="inline-flex items-center text-sm font-medium text-sky-600 hover:text-sky-800 mb-4 transition-colors">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Dashboard
        </Link>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-900 to-indigo-800 tracking-tight">AI Performance Analysis</h1>
            <p className="text-[var(--color-text-muted)] mt-1">Deep dive into your cognitive strengths, independence patterns, and assignment-level insights.</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-700 font-medium text-sm shadow-sm opacity-90 cursor-default">
            <Brain className="h-4 w-4" /> Powered by CogAIt Analysts
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Short Term Analyzer (Agent 2 equivalent) */}
        <div className="rounded-3xl border border-[var(--color-border)] spatial-widget shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-sky-50 to-indigo-50 px-6 py-5 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2 text-sky-900">
               <Activity className="h-5 w-5" />
               <h2 className="text-lg font-semibold">Recent Analysis (Agent 2)</h2>
            </div>
          </div>
          <div className="p-6 flex-1">
             {!analytics.shortTermAnalyzer ? (
               <p className="text-[var(--color-text-muted)] italic text-center mt-6">Complete an assignment to see recent deep-dive analytics.</p>
             ) : (
               <div className="space-y-4">
                 <div>
                   <p className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-1">Target</p>
                   <p className="text-lg font-medium text-white/80">{analytics.shortTermAnalyzer.recentAssignmentTitle}</p>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="rounded-2xl bg-sky-50/50 border border-[var(--color-border)] p-4">
                     <p className="text-xs uppercase text-sky-800/70 font-semibold">Independence</p>
                     <p className="text-2xl font-bold text-sky-900 mt-1">{analytics.shortTermAnalyzer.independence}%</p>
                   </div>
                   <div className="rounded-2xl bg-amber-50/50 border border-amber-100 p-4">
                     <p className="text-xs uppercase text-amber-800/70 font-semibold">Total Help Used</p>
                     <p className="text-2xl font-bold text-amber-900 mt-1">{analytics.shortTermAnalyzer.helpRequests}</p>
                   </div>
                 </div>
                 <div className="pt-2">
                   <p className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-2">Topics Mastered Formally</p>
                   <div className="flex flex-wrap gap-2">
                     {analytics.shortTermAnalyzer.topicsCovered.length > 0 ? analytics.shortTermAnalyzer.topicsCovered.map((t: string) => (
                       <span key={t} className="px-3 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-xs font-medium">{t}</span>
                     )) : (
                       <span className="text-xs text-white/50">None detected</span>
                     )}
                   </div>
                 </div>
               </div>
             )}
          </div>
        </div>

        {/* Long Term Trajectory (Agent 4 equivalent) */}
        <div className="rounded-3xl border border-[var(--color-border)] spatial-widget shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-5 border-b border-emerald-100 flex justify-between items-center">
            <div className="flex items-center gap-2 text-emerald-900">
               <TrendingUp className="h-5 w-5" />
               <h2 className="text-lg font-semibold">Long-Term Trajectory (Agent 4)</h2>
            </div>
            {isDeclining && (
              <span className="flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-100 px-2 py-1 rounded-full">
                <AlertCircle className="h-3 w-3" /> Pattern Decline
              </span>
            )}
          </div>
          <div className="p-6 flex-1">
             <div className="space-y-6">
               {analytics.longTermTrajectory.map((b: any, i: number) => {
                 return (
                   <div key={b.label} className="relative group">
                     <div className="flex items-center justify-between mb-1">
                       <span className="text-sm font-medium text-white/70">{b.label} <span className="text-xs text-white/40 font-normal ml-1">({b.assignmentsCount} questions)</span></span>
                       <span className="text-sm font-bold text-white">{b.cis}% CIS</span>
                     </div>
                     <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                       <div 
                         className={`h-full rounded-full transition-all duration-1000 ${
                           b.cis < 40 ? "bg-rose-500" : b.cis < 70 ? "bg-amber-400" : "bg-emerald-500"
                         }`}
                         style={{ width: `${Math.max(0, Math.min(100, b.cis))}%` }}
                       />
                     </div>
                   </div>
                 )
               })}
             </div>
             <div className="mt-8 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[var(--color-border)] p-4">
                <p className="text-sm text-white/60">
                  <strong className="text-white/80">Your Cognitive Independence Score (CIS)</strong> is calculated over time. It measures how effectively you solve problems without relying on deep AI scaffolding layers.
                </p>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Topic Breakdown */}
        <div className="rounded-3xl border border-[var(--color-border)] spatial-widget shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6">
          <div className="flex items-center gap-2 text-sky-900 mb-6">
             <Layers className="h-5 w-5 text-indigo-500" />
             <h2 className="text-lg font-semibold text-white/80">Topic Deep Dive</h2>
          </div>
          
          <div className="space-y-8">
            {/* Strong Topics */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Award className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Strong Points</h3>
              </div>
              <div className="space-y-3">
                {analytics.topicInsights.strongTopics.length === 0 ? (
                  <p className="text-sm text-white/40 italic">Not enough data to determine strengths.</p>
                ) : (
                  analytics.topicInsights.strongTopics.map((t: any) => (
                    <div key={t.topic} className="flex justify-between items-center p-3 rounded-xl border border-emerald-100 bg-emerald-50/30">
                      <span className="font-medium text-emerald-900">{t.topic}</span>
                      <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg text-sm">{t.score}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Weak Topics */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="h-4 w-4 text-rose-600" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Lagging Behind</h3>
              </div>
              <div className="space-y-3">
                {analytics.topicInsights.weakTopics.length === 0 ? (
                  <p className="text-sm text-white/40 italic">No clear lagging domains identified.</p>
                ) : (
                  analytics.topicInsights.weakTopics.map((t: any) => (
                    <div key={t.topic} className="flex justify-between items-center p-3 rounded-xl border border-rose-100 bg-rose-50/30">
                      <span className="font-medium text-rose-900">{t.topic}</span>
                      <span className="font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg text-sm">{t.score}%</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Classroom-wise performance */}
        <div className="rounded-3xl border border-[var(--color-border)] spatial-widget shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 flex flex-col h-full">
          <div className="flex items-center gap-2 text-sky-900 mb-6">
             <BookOpen className="h-5 w-5 text-cyan-500" />
             <h2 className="text-lg font-semibold text-white/80">Classroom Overview</h2>
          </div>

          <div className="flex-1 space-y-4">
             {analytics.classroomInsights.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-center">
                 <p className="text-[var(--color-text-muted)]">You are not enrolled in any classrooms, or haven't completed any classroom assignments.</p>
               </div>
             ) : (
               analytics.classroomInsights.map((c: any) => (
                 <div key={c.classroomId} className="p-4 rounded-2xl border border-[var(--color-border)] bg-gradient-to-r from-slate-50 to-white flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                   <div>
                     <p className="font-bold text-white/80">{c.classroomName}</p>
                     <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mt-1">{c.totalAssignments} class sets completed</p>
                   </div>
                   <div className="flex items-center gap-4">
                     <div className="text-center">
                       <p className="text-xs text-white/50 font-medium">Avg Score</p>
                       <p className="text-lg font-bold text-sky-700">{c.avgScore}%</p>
                     </div>
                     <div className="w-px h-8 bg-slate-200"></div>
                     <div className="text-center">
                       <p className="text-xs text-white/50 font-medium">Avg CIS</p>
                       <p className="text-lg font-bold text-indigo-700">{c.avgIndependence}%</p>
                     </div>
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
