import { isFeatureEnabled } from "./featureFlags";

export async function writeAuditLog(params: {
  ctx: { db: { insert: (table: "auditLogs", value: Record<string, unknown>) => Promise<unknown> } };
  organizationId: string;
  actorId: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isFeatureEnabled("auditTrail", params.organizationId)) {
    return;
  }

  await params.ctx.db.insert("auditLogs", {
    organizationId: params.organizationId,
    actorId: params.actorId,
    eventType: params.eventType,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    createdAt: Date.now(),
  });
}
