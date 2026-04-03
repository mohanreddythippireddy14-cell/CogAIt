type MockDoc = Record<string, unknown> & { _id?: string };

export function createMockCtx(params: {
  organizationId: string;
  role: "student" | "lecturer" | "organizationAdmin";
  userId: string;
  seed?: {
    assignments?: MockDoc[];
    aiUsageMetrics?: MockDoc[];
    sessionLocks?: MockDoc[];
  };
}) {
  const state = {
    assignments: [...(params.seed?.assignments ?? [])],
    aiUsageMetrics: [...(params.seed?.aiUsageMetrics ?? [])],
    sessionLocks: [...(params.seed?.sessionLocks ?? [])],
  };

  return {
    db: {
      get: async (id: string) => {
        const all = [...state.assignments, ...state.aiUsageMetrics, ...state.sessionLocks];
        return all.find((doc) => doc._id === id) ?? null;
      },
      query: (table: "assignments" | "aiUsageMetrics" | "sessionLocks") => {
        let rows: MockDoc[] = table === "assignments"
          ? state.assignments
          : table === "aiUsageMetrics"
            ? state.aiUsageMetrics
            : state.sessionLocks;

        const chain = {
          withIndex: (_name: string, cb: (q: { eq: (field: string, value: unknown) => any }) => any) => {
            const filters: Array<{ field: string; value: unknown }> = [];
            const q = {
              eq: (field: string, value: unknown) => {
                filters.push({ field, value });
                return q;
              },
            };
            cb(q);
            rows = rows.filter((row) => filters.every((f) => row[f.field] === f.value));
            return chain;
          },
          collect: async () => [...rows],
          first: async () => rows[0] ?? null,
          order: (_direction: "asc" | "desc") => chain,
          take: async (count: number) => rows.slice(0, count),
        };
        return chain;
      },
      insert: async (table: "aiUsageMetrics" | "assignments" | "sessionLocks", doc: MockDoc) => {
        const inserted = { ...doc, _id: `${table}_${Math.random().toString(36).slice(2)}` };
        if (table === "aiUsageMetrics") state.aiUsageMetrics.push(inserted);
        if (table === "assignments") state.assignments.push(inserted);
        if (table === "sessionLocks") state.sessionLocks.push(inserted);
        return inserted._id;
      },
      patch: async (_id: string, _patch: MockDoc) => null,
    },
    auth: {
      getUserIdentity: async () => ({
        subject: params.userId,
      }),
    },
    scheduler: {},
    storage: {},
    meta: {
      organizationId: params.organizationId,
      role: params.role,
      userId: params.userId,
      state,
    },
  };
}
