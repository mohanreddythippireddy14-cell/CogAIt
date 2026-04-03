import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

function extractEmail(userDoc: unknown): string | undefined {
  if (!userDoc || typeof userDoc !== "object") {
    return undefined;
  }
  const candidate = userDoc as {
    email?: unknown;
    emailVerification?: { email?: unknown };
    emailAddresses?: Array<{ email?: unknown }>;
  };
  if (typeof candidate.email === "string") {
    return candidate.email;
  }
  if (typeof candidate.emailVerification?.email === "string") {
    return candidate.emailVerification.email;
  }
  const primary = candidate.emailAddresses?.find((entry) => typeof entry.email === "string");
  if (typeof primary?.email === "string") {
    return primary.email;
  }
  return undefined;
}

export const getAssignmentNotificationPayload = internalQuery({
  args: {
    assignmentId: v.id("assignments"),
  },
  returns: v.object({
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
    title: v.string(),
    description: v.optional(v.string()),
    timeLimitMinutes: v.number(),
    totalQuestions: v.number(),
    classroomName: v.optional(v.string()),
    recipients: v.array(
      v.object({
        studentId: v.id("users"),
        fullName: v.string(),
        email: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) {
      throw new Error("Assignment not found.");
    }

    const classroom = assignment.classroomId ? await ctx.db.get(assignment.classroomId) : null;
    const classroomName = classroom?.name;

    const profiles = await ctx.db
      .query("userProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", assignment.organizationId))
      .collect();
    const studentProfiles = profiles.filter((profile) => profile.role === "student");
    const studentProfileById = new Map(
      studentProfiles.map((profile) => [profile.userId.toString(), profile]),
    );

    let targetStudentIds = new Set(studentProfiles.map((profile) => profile.userId.toString()));
    if (assignment.classroomId) {
      const enrollments = await ctx.db
        .query("classEnrollments")
        .withIndex("by_classroom", (q) => q.eq("classroomId", assignment.classroomId!))
        .collect();
      targetStudentIds = new Set(
        enrollments
          .map((row) => row.studentId.toString())
          .filter((studentId) => studentProfileById.has(studentId)),
      );
    }

    const recipients: Array<{
      studentId: typeof studentProfiles[number]["userId"];
      fullName: string;
      email: string;
    }> = [];
    for (const studentIdString of targetStudentIds) {
      const profile = studentProfileById.get(studentIdString);
      if (!profile) {
        continue;
      }
      const userDoc = await ctx.db.get(profile.userId);
      const email = extractEmail(userDoc);
      if (!email) {
        continue;
      }
      recipients.push({
        studentId: profile.userId,
        fullName: profile.fullName,
        email,
      });
    }

    return {
      organizationId: assignment.organizationId,
      assignmentId: assignment._id,
      title: assignment.title,
      description: assignment.description,
      timeLimitMinutes: assignment.timeLimitMinutes,
      totalQuestions: assignment.totalQuestions,
      classroomName,
      recipients,
    };
  },
});

export const recordAssignmentNotification = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    assignmentId: v.id("assignments"),
    studentId: v.id("users"),
    email: v.string(),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    error: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("assignmentNotifications", {
      organizationId: args.organizationId,
      assignmentId: args.assignmentId,
      studentId: args.studentId,
      email: args.email,
      status: args.status,
      error: args.error,
      sentAt: args.sentAt,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const sendAssignmentPublishedNotifications = internalAction({
  args: {
    assignmentId: v.id("assignments"),
    publishedAt: v.number(),
  },
  returns: v.object({
    queued: v.number(),
    sent: v.number(),
    failed: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.notifications.getAssignmentNotificationPayload, {
      assignmentId: args.assignmentId,
    });
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;
    const appUrl = process.env.CONVEX_SITE_URL ?? process.env.VITE_CONVEX_SITE_URL ?? "";
    const publishedAtText = new Date(args.publishedAt).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    let queued = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const recipient of payload.recipients) {
      queued += 1;
      await ctx.runMutation(internal.notifications.recordAssignmentNotification, {
        organizationId: payload.organizationId,
        assignmentId: payload.assignmentId,
        studentId: recipient.studentId,
        email: recipient.email,
        status: "queued",
      });

      if (!apiKey || !fromEmail) {
        skipped += 1;
        await ctx.runMutation(internal.notifications.recordAssignmentNotification, {
          organizationId: payload.organizationId,
          assignmentId: payload.assignmentId,
          studentId: recipient.studentId,
          email: recipient.email,
          status: "skipped",
          error: "Missing RESEND_API_KEY or RESEND_FROM_EMAIL environment variable.",
        });
        continue;
      }

      try {
        const subject = `New Assignment Posted: ${payload.title}`;
        const classLine = payload.classroomName ? `<p><strong>Classroom:</strong> ${payload.classroomName}</p>` : "";
        const descriptionLine = payload.description ? `<p><strong>Description:</strong> ${payload.description}</p>` : "";
        const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/student/dashboard` : "";
        const dashboardLine = dashboardUrl
          ? `<p><a href="${dashboardUrl}">Open student dashboard</a></p>`
          : "";
        const html = `
          <div>
            <p>Hello ${recipient.fullName},</p>
            <p>A new assignment has been posted in CogAIt.</p>
            <p><strong>Title:</strong> ${payload.title}</p>
            ${classLine}
            ${descriptionLine}
            <p><strong>Total Questions:</strong> ${payload.totalQuestions}</p>
            <p><strong>Time Limit:</strong> ${payload.timeLimitMinutes} minutes</p>
            <p><strong>Published:</strong> ${publishedAtText}</p>
            ${dashboardLine}
          </div>
        `;

        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipient.email],
            subject,
            html,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || `Resend API error (${response.status})`);
        }

        sent += 1;
        await ctx.runMutation(internal.notifications.recordAssignmentNotification, {
          organizationId: payload.organizationId,
          assignmentId: payload.assignmentId,
          studentId: recipient.studentId,
          email: recipient.email,
          status: "sent",
          sentAt: Date.now(),
        });
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Failed to send email";
        await ctx.runMutation(internal.notifications.recordAssignmentNotification, {
          organizationId: payload.organizationId,
          assignmentId: payload.assignmentId,
          studentId: recipient.studentId,
          email: recipient.email,
          status: "failed",
          error: message,
        });
      }
    }

    return { queued, sent, failed, skipped };
  },
});
