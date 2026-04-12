import { httpRouter } from "convex/server";
import { exportAssignmentData, exportLecturerDataset } from "./export";

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

export default http;
