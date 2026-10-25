import { Router } from "express";
import {
  createApplication,
  deleteApplication,
  getApplications,
  updateApplication
} from "../controllers/applicationController.js";
import { requireAuth } from "../middleware/auth.js";

export const applicationRoutes = Router();

applicationRoutes.use(requireAuth);
applicationRoutes.post("/", createApplication);
applicationRoutes.get("/", getApplications);
applicationRoutes.patch("/:id", updateApplication);
applicationRoutes.delete("/:id", deleteApplication);
