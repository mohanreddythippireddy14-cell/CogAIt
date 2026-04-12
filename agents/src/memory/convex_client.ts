import { ConvexHttpClient } from "convex/browser";

// For Cloud Run, CONVEX_URL should be in env vars
const convexUrl = process.env.CONVEX_URL || "http://127.0.0.1:3210";
export const convex = new ConvexHttpClient(convexUrl);

// Agent Internal Methods exposing specific API calls
// Example: fetching historical assignment records
export const fetchStudentHistory = async (studentId: string) => {
  // return convex.query(api.agentAPI.getHistory, { studentId });
  return [];
};
