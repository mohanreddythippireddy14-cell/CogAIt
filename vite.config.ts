/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/agent2": {
        target: "http://localhost:8082",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent2/, ""),
      },
      "/agent7": {
        target: "http://localhost:8087",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent7/, ""),
      },
      "/agent-negotiation": {
        target: "http://localhost:8089",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/agent-negotiation/, ""),
      },
    },
  },
  test: {
    include: ["convex/**/*.test.ts", "agents/src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
