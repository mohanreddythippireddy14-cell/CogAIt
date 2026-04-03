import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "./lib/authGuards";
import { requireSameOrganization } from "./infrastructure/organizationGuard";

const JOIN_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

function generateJoinCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * JOIN_CODE_CHARS.length);
    code += JOIN_CODE_CHARS[idx];
  }
  return code;
}

async function createUniqueJoinCode(ctx: any): Promise<string> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = generateJoinCode();
    const existing = await ctx.db
      .query("classrooms")
      .withIndex("by_join_code", (q: any) => q.eq("joinCode", candidate))
      .first();
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Could not generate a unique classroom code. Please retry.");
}

export const createClassroom = mutation({
  args: {
    name: v.string(),
    subject: v.optional(v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"))),
    batchName: v.optional(v.string()),
    studentLimit: v.optional(v.number()),
  },
  returns: v.object({
    classroomId: v.id("classrooms"),
    joinCode: v.string(),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only faculty can create classrooms.");
    }
    const name = args.name.trim();
    if (!name) {
      throw new Error("Classroom name is required.");
    }

    const joinCode = await createUniqueJoinCode(ctx);
    const classroomId = await ctx.db.insert("classrooms", {
      organizationId: profile.organizationId,
      lecturerId: userId,
      name,
      subject: args.subject,
      batchName: args.batchName?.trim() || undefined,
      studentLimit: args.studentLimit,
      joinCode,
      isActive: true,
      createdAt: Date.now(),
    });
    return { classroomId, joinCode };
  },
});

export const getFacultyClassrooms = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("classrooms"),
      name: v.string(),
      subject: v.optional(v.union(v.literal("Physics"), v.literal("Chemistry"), v.literal("Math"))),
      batchName: v.optional(v.string()),
      studentLimit: v.optional(v.number()),
      joinCode: v.string(),
      isActive: v.boolean(),
      createdAt: v.number(),
      studentCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only faculty can view classrooms.");
    }

    const classrooms = await ctx.db
      .query("classrooms")
      .withIndex("by_org_and_lecturer", (q) =>
        q.eq("organizationId", profile.organizationId).eq("lecturerId", userId),
      )
      .order("desc")
      .collect();

    return await Promise.all(
      classrooms.map(async (classroom) => {
        const enrollments = await ctx.db
          .query("classEnrollments")
          .withIndex("by_classroom", (q) => q.eq("classroomId", classroom._id))
          .collect();
        return {
          _id: classroom._id,
          name: classroom.name,
          subject: classroom.subject,
          batchName: classroom.batchName,
          studentLimit: classroom.studentLimit,
          joinCode: classroom.joinCode,
          isActive: classroom.isActive,
          createdAt: classroom.createdAt,
          studentCount: enrollments.length,
        };
      }),
    );
  },
});

export const renameClassroom = mutation({
  args: {
    classroomId: v.id("classrooms"),
    name: v.string(),
  },
  returns: v.object({
    updated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only faculty can edit classrooms.");
    }
    const classroom = await ctx.db.get(args.classroomId);
    if (!classroom) {
      throw new Error("Classroom not found.");
    }
    requireSameOrganization(classroom.organizationId, profile.organizationId);
    if (classroom.lecturerId !== userId) {
      throw new Error("You can edit only your own classrooms.");
    }
    const name = args.name.trim();
    if (!name) {
      throw new Error("Classroom name is required.");
    }
    await ctx.db.patch(args.classroomId, { name });
    return { updated: true };
  },
});

export const getClassroomRoster = query({
  args: {
    classroomId: v.id("classrooms"),
  },
  returns: v.array(
    v.object({
      studentId: v.id("users"),
      fullName: v.string(),
      joinedAt: v.number(),
      assignmentsAttempted: v.number(),
      avgCis: v.number(),
      avgIndependence: v.number(),
      trend: v.array(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only faculty can view classroom roster.");
    }
    const classroom = await ctx.db.get(args.classroomId);
    if (!classroom) {
      throw new Error("Classroom not found.");
    }
    requireSameOrganization(classroom.organizationId, profile.organizationId);
    if (profile.role === "lecturer" && classroom.lecturerId !== userId) {
      throw new Error("Access denied.");
    }

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const classroomAssignmentIds = new Set(
      assignments.filter((a) => a.classroomId?.toString() === args.classroomId.toString()).map((a) => a._id.toString()),
    );

    const enrollments = await ctx.db
      .query("classEnrollments")
      .withIndex("by_classroom", (q) => q.eq("classroomId", args.classroomId))
      .collect();

    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect()
      .then((rows) => rows.filter((row) => classroomAssignmentIds.has(row.assignmentId.toString())));

    return await Promise.all(
      enrollments.map(async (row) => {
        const studentProfile = await ctx.db
          .query("userProfiles")
          .withIndex("by_user", (q) => q.eq("userId", row.studentId))
          .first();
        const studentAttempts = attempts.filter((a) => a.studentId.toString() === row.studentId.toString());
        const scored = studentAttempts.filter((a) => a.submittedAt && a.cognitiveScore !== undefined);
        const independence = studentAttempts.filter((a) => a.submittedAt && a.independenceScore !== undefined);
        const trend = scored
          .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0))
          .slice(-5)
          .map((a) => a.cognitiveScore ?? 0);

        return {
          studentId: row.studentId,
          fullName: studentProfile?.fullName ?? "Student",
          joinedAt: row.joinedAt,
          assignmentsAttempted: new Set(studentAttempts.map((a) => a.assignmentId.toString())).size,
          avgCis: scored.length > 0 ? Math.round(scored.reduce((sum, a) => sum + (a.cognitiveScore ?? 0), 0) / scored.length) : 0,
          avgIndependence: independence.length > 0
            ? Math.round(independence.reduce((sum, a) => sum + (a.independenceScore ?? 0), 0) / independence.length)
            : 0,
          trend,
        };
      }),
    );
  },
});

export const setClassroomActive = mutation({
  args: {
    classroomId: v.id("classrooms"),
    isActive: v.boolean(),
  },
  returns: v.object({
    updated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only faculty can update classrooms.");
    }
    const classroom = await ctx.db.get(args.classroomId);
    if (!classroom) {
      throw new Error("Classroom not found.");
    }
    requireSameOrganization(classroom.organizationId, profile.organizationId);
    if (classroom.lecturerId !== userId) {
      throw new Error("You can update only your own classrooms.");
    }
    await ctx.db.patch(args.classroomId, { isActive: args.isActive });
    return { updated: true };
  },
});

export const deleteClassroom = mutation({
  args: {
    classroomId: v.id("classrooms"),
  },
  returns: v.object({
    deleted: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "lecturer" && profile.role !== "organizationAdmin") {
      throw new Error("Only faculty can delete classrooms.");
    }
    const classroom = await ctx.db.get(args.classroomId);
    if (!classroom) {
      return { deleted: false };
    }
    requireSameOrganization(classroom.organizationId, profile.organizationId);
    if (classroom.lecturerId !== userId) {
      throw new Error("You can delete only your own classrooms.");
    }

    const assignments = await ctx.db
      .query("assignments")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", profile.organizationId))
      .collect();
    const linkedAssignments = assignments.filter(
      (assignment) => assignment.classroomId === args.classroomId,
    );
    for (const assignment of linkedAssignments) {
      await ctx.db.patch(assignment._id, { classroomId: undefined });
    }

    const enrollments = await ctx.db
      .query("classEnrollments")
      .withIndex("by_classroom", (q) => q.eq("classroomId", args.classroomId))
      .collect();
    for (const enrollment of enrollments) {
      await ctx.db.delete(enrollment._id);
    }

    await ctx.db.delete(args.classroomId);
    return { deleted: true };
  },
});

export const getStudentClassrooms = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("classrooms"),
      name: v.string(),
      joinCode: v.string(),
      joinedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
    if (profile.role !== "student") {
      throw new Error("Only students can view joined classrooms.");
    }

    const enrollments = await ctx.db
      .query("classEnrollments")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId),
      )
      .order("desc")
      .collect();

    const classrooms = await Promise.all(
      enrollments.map(async (enrollment) => {
        const classroom = await ctx.db.get(enrollment.classroomId);
        if (!classroom || !classroom.isActive) {
          return null;
        }
        return {
          _id: classroom._id,
          name: classroom.name,
          joinCode: classroom.joinCode,
          joinedAt: enrollment.joinedAt,
        };
      }),
    );

    return classrooms.filter((c): c is NonNullable<typeof c> => Boolean(c));
  },
});

export const joinClassByCode = mutation({
  args: {
    code: v.string(),
  },
  returns: v.object({
    classroomId: v.id("classrooms"),
    classroomName: v.string(),
    joinCode: v.string(),
    joined: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
    if (profile.role !== "student") {
      throw new Error("Only students can join classrooms.");
    }

    const normalizedCode = normalizeJoinCode(args.code);
    if (!normalizedCode) {
      throw new Error("Please enter a valid classroom code.");
    }

    const classroom = await ctx.db
      .query("classrooms")
      .withIndex("by_join_code", (q) => q.eq("joinCode", normalizedCode))
      .first();
    if (!classroom || !classroom.isActive) {
      throw new Error("Classroom code is invalid or inactive.");
    }
    requireSameOrganization(classroom.organizationId, profile.organizationId);

    const existingEnrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_classroom_student", (q) =>
        q.eq("classroomId", classroom._id).eq("studentId", userId),
      )
      .first();
    if (!existingEnrollment) {
      await ctx.db.insert("classEnrollments", {
        organizationId: profile.organizationId,
        classroomId: classroom._id,
        studentId: userId,
        joinedAt: Date.now(),
      });
    }

    return {
      classroomId: classroom._id,
      classroomName: classroom.name,
      joinCode: classroom.joinCode,
      joined: !existingEnrollment,
    };
  },
});

export const unenrollFromClass = mutation({
  args: {
    classroomId: v.id("classrooms"),
  },
  returns: v.object({
    removed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { profile, userId } = await requireAuthWithProfile(ctx);
    if (profile.role !== "student") {
      throw new Error("Only students can unenroll from classrooms.");
    }

    const classroom = await ctx.db.get(args.classroomId);
    if (!classroom) {
      throw new Error("Classroom not found.");
    }
    requireSameOrganization(classroom.organizationId, profile.organizationId);

    const enrollment = await ctx.db
      .query("classEnrollments")
      .withIndex("by_classroom_student", (q) =>
        q.eq("classroomId", args.classroomId).eq("studentId", userId),
      )
      .first();

    if (!enrollment) {
      return { removed: false };
    }

    await ctx.db.delete(enrollment._id);
    return { removed: true };
  },
});
