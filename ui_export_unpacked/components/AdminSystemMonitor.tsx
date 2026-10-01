import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function AdminSystemMonitor() {
  const monitoring = useQuery((api as any)["dashboard/monitoring"].getRollupMonitoring, {});

  if (monitoring === undefined) {
    return <div className="ui-page text-muted">Loading system monitoring...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-8 space-y-4">
      <h1 className="text-2xl font-semibold">System Monitoring (Internal)</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <Card label="Stale rollups" value={`${monitoring.staleRollupCount}`} />
        <Card label="Job failures (24h)" value={`${monitoring.jobFailures24h}`} />
        <Card label="Drift (24h)" value={`${monitoring.driftPercentage24h}%`} />
        <Card label="P95 target (overview)" value={`${monitoring.p95TargetsMs.teacherOverview}ms`} />
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-card p-4">
      <p className="text-subtle">{label}</p>
      <p className="font-semibold mt-1">{value}</p>
    </div>
  );
}


