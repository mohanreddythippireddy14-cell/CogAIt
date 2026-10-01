import { httpRouter } from "convex/server";
import { exportAssignmentData, exportLecturerDataset } from "./export";
import { proxyChatCompletions, proxyOptions } from "./geminiProxy";

const http = httpRouter();

http.route({
  path: "/export/assignment",
  method: "GET",
  handler: exportAssignmentData,
});

http.route({
  path: "/export/institution",
  method: "GET",
  handler: exportLecturerDataset,
});

http.route({
  path: "/api/gemini-proxy/openai/v1/chat/completions",
  method: "POST",
  handler: proxyChatCompletions,
});

http.route({
  path: "/api/gemini-proxy/openai/v1/chat/completions",
  method: "OPTIONS",
  handler: proxyOptions,
});

export default http;
