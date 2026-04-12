import { isFeatureEnabled } from "./featureFlags.js";

export async function enqueueAiJob(params: {
  organizationId: string;
  scheduler: { runAfter: (delayMs: number, fnRef: any, args: any) => Promise<unknown> };
  delayMs: number;
  fnRef: any;
  args: any;
  fallback: () => Promise<void>;
}) {
  if (!isFeatureEnabled("aiQueueAbstraction", params.organizationId)) {
    await params.fallback();
    return;
  }
  await params.scheduler.runAfter(params.delayMs, params.fnRef, params.args);
}
