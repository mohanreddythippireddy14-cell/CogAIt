export const validateSchema = <T>(payload: any, schemaName: string): T => {
  // TODO: Implement runtime schema validation logic (e.g. using Zod)
  // that strictly matches our src/types/index.ts TS definitions.
  return payload as T;
};
