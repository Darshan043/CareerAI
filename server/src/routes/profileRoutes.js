import { Router } from "express";
import multer from "multer";
import {
  getProfile,
  getResumeHistory,
  updatePreferences,
  updateProfile,
  updateSkillProgress,
  uploadResume
} from "../controllers/profileController.js";
import { requireAuth } from "../middleware/auth.js";
import { httpError } from "../utils/httpError.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(httpError(400, "Only PDF resumes are supported."));
      return;
    }
    cb(null, true);
  }
});

export const profileRoutes = Router();

profileRoutes.use(requireAuth);
profileRoutes.get("/", getProfile);
profileRoutes.get("/history", getResumeHistory);
profileRoutes.post("/upload-resume", upload.single("resume"), uploadResume);
profileRoutes.patch("/", updateProfile);
profileRoutes.patch("/preferences", updatePreferences);
profileRoutes.patch("/skill-progress", updateSkillProgress);
