import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "dashboard rollup reconcile hourly",
  { hours: 1 },
  (internal as any)["dashboard/jobs"].reconcileRecentRollups,
  {},
);

crons.cron(
  "dashboard rollup nightly snapshot",
  "0 1 * * *",
  (internal as any)["dashboard/jobs"].nightlyRollupSnapshot,
  {},
);

crons.interval(
  "dashboard rollup drift detection",
  { hours: 2 },
  (internal as any)["dashboard/jobs"].detectRollupDrift,
  {},
);

crons.interval(
  "faculty ai job timeout sweep",
  { minutes: 10 },
  (internal as any).facultyAssignments.expireStaleProcessingJobsGlobal,
  { timeoutMs: 20 * 60 * 1000 },
);

export default crons;
