import { Router } from "express";
import { getSkillGap } from "../controllers/skillGapController.js";
import { requireAuth } from "../middleware/auth.js";

export const skillGapRoutes = Router();

skillGapRoutes.use(requireAuth);
skillGapRoutes.get("/:internshipId", getSkillGap);
