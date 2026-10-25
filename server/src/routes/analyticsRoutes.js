import { Router } from "express";
import { getAnalytics } from "../controllers/analyticsController.js";
import { requireAuth } from "../middleware/auth.js";

export const analyticsRoutes = Router();

analyticsRoutes.use(requireAuth);
analyticsRoutes.get("/", getAnalytics);
