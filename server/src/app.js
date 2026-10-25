import cors from "cors";
import express from "express";
import { analyticsRoutes } from "./routes/analyticsRoutes.js";
import { applicationMaterialRoutes } from "./routes/applicationMaterialRoutes.js";
import { applicationRoutes } from "./routes/applicationRoutes.js";
import { authRoutes } from "./routes/authRoutes.js";
import { internshipRoutes } from "./routes/internshipRoutes.js";
import { matchRoutes } from "./routes/matchRoutes.js";
import { notificationRoutes } from "./routes/notificationRoutes.js";
import { profileRoutes } from "./routes/profileRoutes.js";
import { skillGapRoutes } from "./routes/skillGapRoutes.js";
import { env } from "./config/env.js";
import { dbState } from "./config/db.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

export const app = express();

const configuredOrigins = new Set([
  env.clientUrl,
  ...env.clientUrls,
  "https://career-ai-indol-delta.vercel.app"
]);
const developmentOriginPattern = /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):\d+$/;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (configuredOrigins.has(origin) || (env.nodeEnv === "development" && developmentOriginPattern.test(origin))) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "CareerPilot AI API",
    aiRuntime: env.geminiApiKey ? `Google Gemini (${env.geminiModel})` : "Ollama local inference / rule-based analysis",
    jobSearch: env.jsearchApiKey
      ? "JSearch primary with Himalayas fallback"
      : "Himalayas fallback (JSearch is not configured)",
    persistence: {
      mode: dbState.mode,
      connected: dbState.connected
    },
    autoApplyEnabled: false
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/internships", internshipRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/skill-gaps", skillGapRoutes);
app.use("/api/application-materials", applicationMaterialRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use(notFound);
app.use(errorHandler);
