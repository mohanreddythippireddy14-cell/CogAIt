import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthWithProfile } from "./lib/authGuards";

export const getStudentAnalytics = query({
  args: {},
  returns: v.object({
    longTermTrajectory: v.array(
      v.object({
        label: v.string(),
        cis: v.number(),
        assignmentsCount: v.number(),
      })
    ),
    classroomInsights: v.array(
      v.object({
        classroomId: v.string(),
        classroomName: v.string(),
        avgIndependence: v.number(),
        avgScore: v.number(),
        totalAssignments: v.number(),
      })
    ),
    topicInsights: v.object({
      strongTopics: v.array(v.object({ topic: v.string(), score: v.number() })),
      weakTopics: v.array(v.object({ topic: v.string(), score: v.number() })),
    }),
    shortTermAnalyzer: v.union(
      v.object({
        recentAssignmentTitle: v.string(),
        independence: v.number(),
        topicsCovered: v.array(v.string()),
        helpRequests: v.number(),
      }),
      v.null()
    ),
  }),
  handler: async (ctx) => {
    const { userId, profile } = await requireAuthWithProfile(ctx);
    if (profile.role !== "student") throw new Error("Only students can view analytics");

    // Get all scored attempts for the student
    const allAttempts = await ctx.db
      .query("attempts")
      .withIndex("by_org_and_student", (q) =>
        q.eq("organizationId", profile.organizationId).eq("studentId", userId)
      )
      .collect();

    const scoredAttempts = allAttempts.filter((a) => a.submittedAt && a.independenceScore !== undefined);

    // 1. Long Term Trajectory (1 week, 1 month, 3 months, 6 months)
    const now = Date.now();
    const oneWeek = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonth = now - 30 * 24 * 60 * 60 * 1000;
    const threeMonths = now - 90 * 24 * 60 * 60 * 1000;
    const sixMonths = now - 180 * 24 * 60 * 60 * 1000;

    const buckets = [
      { label: "6 Months", start: sixMonths, end: threeMonths, cis: 0, count: 0, sum: 0 },
      { label: "3 Months", start: threeMonths, end: oneMonth, cis: 0, count: 0, sum: 0 },
      { label: "1 Month", start: oneMonth, end: oneWeek, cis: 0, count: 0, sum: 0 },
      { label: "1 Week", start: oneWeek, end: now, cis: 0, count: 0, sum: 0 },
    ];

    const uniqueAssignmentsScored = new Set();
    const assignmentStats = new Map<string, { ind: number; score: number; questions: number; correct: number }>();

    for (const attempt of scoredAttempts) {
      const ts = attempt.submittedAt!;
      uniqueAssignmentsScored.add(attempt.assignmentId.toString());

      // Bucket trajectory
      for (const bucket of buckets) {
        if (ts >= bucket.start && ts < bucket.end) {
          bucket.sum += attempt.independenceScore ?? 0;
          bucket.count++;
        }
      }

      // Aggregate assignment stats
      const aid = attempt.assignmentId.toString();
      if (!assignmentStats.has(aid)) {
        assignmentStats.set(aid, { ind: 0, score: 0, questions: 0, correct: 0 });
      }
      const st = assignmentStats.get(aid)!;
      st.ind += attempt.independenceScore ?? 0;
      st.questions++;
      if (attempt.isCorrect) st.correct++;
    }

    const longTermTrajectory = buckets.map(b => ({
      label: b.label,
      cis: b.count > 0 ? Math.round(b.sum / b.count) : 0,
      assignmentsCount: b.count, // note: this is actually request count logically
    }));

    // 2. Classroom Insights
    const joinedClassrooms = await ctx.db
      .query("classEnrollments")
      .withIndex("by_org_and_student", q => q.eq("organizationId", profile.organizationId).eq("studentId", userId))
      .collect();
      
    const classroomInsights = [];
    for (const classRow of joinedClassrooms) {
      const classroom = await ctx.db.get(classRow.classroomId);
      if (!classroom) continue;

      const classAssignments = await ctx.db
        .query("assignments")
        .withIndex("by_organizationId", q => q.eq("organizationId", profile.organizationId))
        .collect();
      
      const filtered = classAssignments.filter(a => a.classroomId === classRow.classroomId);
      
      let totalInd = 0, totalScore = 0, validAss = 0;
      for (const fa of filtered) {
         const aid = fa._id.toString();
         if (assignmentStats.has(aid)) {
            const st = assignmentStats.get(aid)!;
            totalInd += Math.round(st.ind / st.questions);
            totalScore += Math.round((st.correct / st.questions) * 100);
            validAss++;
         }
      }
      
      classroomInsights.push({
         classroomId: classroom._id.toString(),
         classroomName: classroom.name,
         avgIndependence: validAss > 0 ? Math.round(totalInd / validAss) : 0,
         avgScore: validAss > 0 ? Math.round(totalScore / validAss) : 0,
         totalAssignments: validAss,
      });
    }

    // 3. Topic Insights
    const topicTracker = new Map<string, { correct: number; total: number }>();
    const questionsNeeded = new Set(scoredAttempts.map(a => a.questionId));
    
    // Naively, fetching all questions may be heavy, but we can do it efficiently
    for (const qId of questionsNeeded) {
      const q = await ctx.db.get(qId);
      if (!q) continue;
      
      // Find the attempt
      const attempt = scoredAttempts.find(a => a.questionId === qId);
      if (!attempt) continue;

      const t = q.topic;
      if (!topicTracker.has(t)) topicTracker.set(t, { correct: 0, total: 0 });
      const track = topicTracker.get(t)!;
      track.total++;
      if (attempt.isCorrect) track.correct++;
    }

    const topicsArr = Array.from(topicTracker.entries()).map(([topic, data]) => ({
      topic,
      score: Math.round((data.correct / data.total) * 100),
      total: data.total
    })).filter(t => t.total >= 2); // Minimum 2 questions to count

    topicsArr.sort((a, b) => b.score - a.score);
    const strongTopics = topicsArr.slice(0, 3).map(t => ({ topic: t.topic, score: t.score }));
    const weakTopics = topicsArr.slice(-3).reverse().map(t => ({ topic: t.topic, score: t.score }));

    // 4. Short-Term Analyzer (Most Recent Assignment)
    let shortTermAnalyzer = null;
    const allAssignmentsScoredList = Array.from(uniqueAssignmentsScored);
    if (allAssignmentsScoredList.length > 0) {
       // Sort scored attempts by submittedAt desc
       const sortedAttempts = [...scoredAttempts].sort((a,b) => b.submittedAt! - a.submittedAt!);
       const recentAssignmentId = sortedAttempts[0].assignmentId;
       const recentAssignment = await ctx.db.get(recentAssignmentId);
       
       if (recentAssignment) {
         const recentAttempts = scoredAttempts.filter(a => a.assignmentId === recentAssignmentId);
         const totalInd = recentAttempts.reduce((sum, a) => sum + (a.independenceScore ?? 0), 0);
         const avgInd = Math.round(totalInd / recentAttempts.length);
         const totalHelp = recentAttempts.reduce((sum, a) => sum + a.totalHelpRequests, 0);

         const recentQIds = new Set(recentAttempts.map(a => a.questionId));
         const topicsCovered = new Set<string>();
         for (const qid of recentQIds) {
           const q = await ctx.db.get(qid);
           if (q) topicsCovered.add(q.topic);
         }

         shortTermAnalyzer = {
           recentAssignmentTitle: recentAssignment.title,
           independence: avgInd,
           topicsCovered: Array.from(topicsCovered),
           helpRequests: totalHelp,
         };
       }
    }

    return {
      longTermTrajectory,
      classroomInsights,
      topicInsights: { strongTopics, weakTopics },
      shortTermAnalyzer
    };
  }
});
