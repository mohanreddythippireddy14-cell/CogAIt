import { type ReactNode, useEffect, useState } from "react";
import { useAction, useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Brain, Clock, Users } from "lucide-react";

type AssignmentDashboardData = {
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
  topicHeatmap: Array<{
    topic: string;
    subject: "Physics" | "Chemistry" | "Math";
    accuracy: number;
    independence: number;
    dependencyLevel: "low" | "medium" | "high";
    status: "strong" | "moderate" | "weak";
  }>;
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
};

export function AssignmentAnalytics() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const convex = useConvex();
  const anyApi = api as any;
  const getAssignmentDashboard = useAction((anyApi as any)["dashboard/assignmentDashboard"].getAssignmentDashboard);
  const [alerts, setAlerts] = useState<Array<{ assignmentId: string; severity: "low" | "medium" | "high" }>>([]);
  const [data, setData] = useState<AssignmentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assignmentId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getAssignmentDashboard({ assignmentId: assignmentId as Id<"assignments"> })
      .then((result: AssignmentDashboardData) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId, getAssignmentDashboard]);

  useEffect(() => {
    let cancelled = false;
    void convex
      .query((anyApi as any)["dashboard/alerts"].getActiveAlerts, {})
      .then((rows) => {
        if (!cancelled) {
          setAlerts(rows ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAlerts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [convex, anyApi]);

  const formatFreshness = (updatedAt?: number) => {
    if (!updatedAt) {
      return "No rollup yet";
    }
    const minutes = Math.floor((Date.now() - updatedAt) / 60000);
    if (minutes <= 0) {
      return "Updated just now";
    }
    if (minutes < 60) {
      return `Updated ${minutes}m ago`;
    }
    return `Updated ${Math.floor(minutes / 60)}h ago`;
  };

  if (loading) {
    return <div className="ui-page text-muted">Loading assignment intelligence...</div>;
  }
  if (!data) {
    return <div className="ui-page text-[var(--color-danger)]">Assignment analytics unavailable.</div>;
  }

  const highRiskCount = data.studentList.filter((row) => row.riskLevel === "high").length;
  const assignmentAlerts = alerts.filter((alert) => alert.assignmentId === data.assignmentId.toString()).length;
  const weakTopics = data.topicHeatmap.filter((row) => row.dependencyLevel === "high").slice(0, 3);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate("/lecturer/dashboard?section=interventions")}
          className="inline-flex items-center text-muted hover:text-[var(--color-text)] mb-3"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Intelligence
        </button>
        <h1 className="app-section-title text-3xl">{data.assignmentTitle}</h1>
        <p className="text-sm text-subtle mt-1">
          {formatFreshness(data.updatedAt)} {data.stale ? "stale data" : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="Students" value={data.summary.totalStudents} icon={<Users className="h-5 w-5 text-blue-600" />} />
        <MetricCard label="Avg Independence" value={`${data.summary.avgIndependenceScore}%`} icon={<Brain className="h-5 w-5 text-green-600" />} />
        <MetricCard label="Avg Overtime" value={`${Math.round(data.summary.avgOvertimeSeconds / 60)} min`} icon={<Clock className="h-5 w-5 text-amber-600" />} />
        <MetricCard label="High Risk / Alerts" value={`${highRiskCount} / ${assignmentAlerts}`} icon={<AlertTriangle className="h-5 w-5 text-red-600" />} />
      </div>

      <div className="app-surface-card p-5">
        <h2 className="app-section-title text-lg">Topic Mastery</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Subject</th>
                <th>Accuracy</th>
                <th>Independence</th>
                <th>Dependency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.topicHeatmap.map((row) => (
                <tr key={`${row.subject}-${row.topic}`}>
                  <td>{row.topic}</td>
                  <td>{row.subject}</td>
                  <td>{row.accuracy}%</td>
                  <td>{row.independence}%</td>
                  <td>{row.dependencyLevel}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="app-surface-card p-5">
        <h2 className="app-section-title text-lg">Student Performance</h2>
        <div className="mt-3 space-y-2">
          {data.studentList.map((row) => (
            <div key={row.studentId} className="rounded-lg border p-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
              <div className="font-medium">{row.name}</div>
              <div>Progress: {row.progress}%</div>
              <div>Indep: {row.independenceScore}%</div>
              <div>Help: {row.avgHelpRequests.toFixed(1)}</div>
              <div>Overtime: {Math.round(row.overtimeSeconds / 60)}m</div>
              <div>Risk: {row.riskLevel}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="app-surface-card p-5">
        <h2 className="app-section-title text-lg">What to Do Next</h2>
        <div className="mt-3 space-y-2 text-sm">
          {weakTopics.length === 0 ? (
            <p className="text-gray-600">No high-dependency topics detected. Class is on track.</p>
          ) : (
            weakTopics.map((topic) => (
              <div key={`${topic.subject}-${topic.topic}`} className="rounded-lg border p-3">
                <p className="font-medium text-gray-900">{topic.topic} ({topic.subject})</p>
                <p className="text-gray-600">
                  High dependency detected. Recommended: schedule a targeted revision and create follow-up practice.
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return (
    <div className="ui-card p-4">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-xs text-subtle">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </div>
    </div>
  );
}


