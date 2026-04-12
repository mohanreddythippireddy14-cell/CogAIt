import { internalMutation, internalQuery } from "./_generated/server.js";
import { v } from "convex/values";

/**
 * Agent API
 * This file exposes secure internal endpoints explicitly designed for use by the 
 * CogAIt Agentic Layer (Cloud Run Hono microservices) to read/write persistent data.
 */

// -----------------------------------------------
// GET / Queries
// -----------------------------------------------
export const getStudentHistory = internalQuery({
  args: { studentId: v.string() },
  returns: v.any(), // TODO: Type with proper v.array()
  handler: async (ctx, args) => {
    // TODO: implement logic
    return [];
  },
});

export const getCohortData = internalQuery({
  args: { batchId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return null;
  },
});

// -----------------------------------------------
// POST / Mutations
// -----------------------------------------------
export const updateCISScore = internalMutation({
  args: { studentId: v.string(), newScore: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // TODO: find student in userProfiles and update
    return null;
  },
});

export const logTopicPerformance = internalMutation({
  args: { 
    studentId: v.string(), 
    assignmentId: v.string(), 
    topicName: v.string(), 
    maxDepth: v.number(), 
    classification: v.string() 
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return null;
  },
});

export const saveSessionRecord = internalMutation({
  args: {
    studentId: v.string(),
    assignmentId: v.string(),
    weakTopics: v.array(v.string())
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    return null;
  },
});

export const createAssignment = internalMutation({
  args: {
    lecturerId: v.string(),
    questions: v.array(v.any())
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    // returns assignment_id
    return `assign_${Date.now()}`;
  },
});

export const saveLecturerBriefing = internalMutation({
  args: { lecturerId: v.string(), briefingMarkdown: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    return null;
  },
});
