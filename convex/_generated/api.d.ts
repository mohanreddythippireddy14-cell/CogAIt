/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminMetrics from "../adminMetrics.js";
import type * as ai from "../ai.js";
import type * as analytics from "../analytics.js";
import type * as api_adminMetrics from "../api/adminMetrics.js";
import type * as api_ai from "../api/ai.js";
import type * as api_analytics from "../api/analytics.js";
import type * as api_assignments from "../api/assignments.js";
import type * as api_attempts from "../api/attempts.js";
import type * as api_faculty from "../api/faculty.js";
import type * as apiV1 from "../apiV1.js";
import type * as application_aiService from "../application/aiService.js";
import type * as application_analyticsService from "../application/analyticsService.js";
import type * as application_attemptService from "../application/attemptService.js";
import type * as application_facultyDraftService from "../application/facultyDraftService.js";
import type * as application_integrityMetricsService from "../application/integrityMetricsService.js";
import type * as assignments from "../assignments.js";
import type * as attempts from "../attempts.js";
import type * as auth from "../auth.js";
import type * as calculations_cognitiveScore from "../calculations/cognitiveScore.js";
import type * as calculations_dependencyAlerts from "../calculations/dependencyAlerts.js";
import type * as calculations_independence from "../calculations/independence.js";
import type * as calculations_topicAnalytics from "../calculations/topicAnalytics.js";
import type * as classrooms from "../classrooms.js";
import type * as constants from "../constants.js";
import type * as costGovernance from "../costGovernance.js";
import type * as crons from "../crons.js";
import type * as dashboard_alerts from "../dashboard/alerts.js";
import type * as dashboard_assignmentDashboard from "../dashboard/assignmentDashboard.js";
import type * as dashboard_backfill from "../dashboard/backfill.js";
import type * as dashboard_jobs from "../dashboard/jobs.js";
import type * as dashboard_monitoring from "../dashboard/monitoring.js";
import type * as dashboard_recommendations from "../dashboard/recommendations.js";
import type * as dashboard_studentProfile from "../dashboard/studentProfile.js";
import type * as dashboard_teacherOverview from "../dashboard/teacherOverview.js";
import type * as dashboardRollups from "../dashboardRollups.js";
import type * as domain_aiPolicy from "../domain/aiPolicy.js";
import type * as domain_aiRegression from "../domain/aiRegression.js";
import type * as domain_contentBlocks from "../domain/contentBlocks.js";
import type * as domain_costGovernance from "../domain/costGovernance.js";
import type * as domain_scoring from "../domain/scoring.js";
import type * as domain_strictJsonValidation from "../domain/strictJsonValidation.js";
import type * as export_ from "../export.js";
import type * as facultyAssignments from "../facultyAssignments.js";
import type * as http from "../http.js";
import type * as infrastructure_aiQueue from "../infrastructure/aiQueue.js";
import type * as infrastructure_auditTrail from "../infrastructure/auditTrail.js";
import type * as infrastructure_authGuards from "../infrastructure/authGuards.js";
import type * as infrastructure_cache from "../infrastructure/cache.js";
import type * as infrastructure_featureFlags from "../infrastructure/featureFlags.js";
import type * as infrastructure_geminiClient from "../infrastructure/geminiClient.js";
import type * as infrastructure_logger from "../infrastructure/logger.js";
import type * as infrastructure_organizationGuard from "../infrastructure/organizationGuard.js";
import type * as interventions from "../interventions.js";
import type * as lib_authGuards from "../lib/authGuards.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as questions from "../questions.js";
import type * as rateLimits from "../rateLimits.js";
import type * as router from "../router.js";
import type * as sessionLocks from "../sessionLocks.js";
import type * as sessions from "../sessions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminMetrics: typeof adminMetrics;
  ai: typeof ai;
  analytics: typeof analytics;
  "api/adminMetrics": typeof api_adminMetrics;
  "api/ai": typeof api_ai;
  "api/analytics": typeof api_analytics;
  "api/assignments": typeof api_assignments;
  "api/attempts": typeof api_attempts;
  "api/faculty": typeof api_faculty;
  apiV1: typeof apiV1;
  "application/aiService": typeof application_aiService;
  "application/analyticsService": typeof application_analyticsService;
  "application/attemptService": typeof application_attemptService;
  "application/facultyDraftService": typeof application_facultyDraftService;
  "application/integrityMetricsService": typeof application_integrityMetricsService;
  assignments: typeof assignments;
  attempts: typeof attempts;
  auth: typeof auth;
  "calculations/cognitiveScore": typeof calculations_cognitiveScore;
  "calculations/dependencyAlerts": typeof calculations_dependencyAlerts;
  "calculations/independence": typeof calculations_independence;
  "calculations/topicAnalytics": typeof calculations_topicAnalytics;
  classrooms: typeof classrooms;
  constants: typeof constants;
  costGovernance: typeof costGovernance;
  crons: typeof crons;
  "dashboard/alerts": typeof dashboard_alerts;
  "dashboard/assignmentDashboard": typeof dashboard_assignmentDashboard;
  "dashboard/backfill": typeof dashboard_backfill;
  "dashboard/jobs": typeof dashboard_jobs;
  "dashboard/monitoring": typeof dashboard_monitoring;
  "dashboard/recommendations": typeof dashboard_recommendations;
  "dashboard/studentProfile": typeof dashboard_studentProfile;
  "dashboard/teacherOverview": typeof dashboard_teacherOverview;
  dashboardRollups: typeof dashboardRollups;
  "domain/aiPolicy": typeof domain_aiPolicy;
  "domain/aiRegression": typeof domain_aiRegression;
  "domain/contentBlocks": typeof domain_contentBlocks;
  "domain/costGovernance": typeof domain_costGovernance;
  "domain/scoring": typeof domain_scoring;
  "domain/strictJsonValidation": typeof domain_strictJsonValidation;
  export: typeof export_;
  facultyAssignments: typeof facultyAssignments;
  http: typeof http;
  "infrastructure/aiQueue": typeof infrastructure_aiQueue;
  "infrastructure/auditTrail": typeof infrastructure_auditTrail;
  "infrastructure/authGuards": typeof infrastructure_authGuards;
  "infrastructure/cache": typeof infrastructure_cache;
  "infrastructure/featureFlags": typeof infrastructure_featureFlags;
  "infrastructure/geminiClient": typeof infrastructure_geminiClient;
  "infrastructure/logger": typeof infrastructure_logger;
  "infrastructure/organizationGuard": typeof infrastructure_organizationGuard;
  interventions: typeof interventions;
  "lib/authGuards": typeof lib_authGuards;
  migrations: typeof migrations;
  notifications: typeof notifications;
  questions: typeof questions;
  rateLimits: typeof rateLimits;
  router: typeof router;
  sessionLocks: typeof sessionLocks;
  sessions: typeof sessions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
