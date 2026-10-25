import { Router } from "express";
import { generateMatches, getMatches } from "../controllers/matchController.js";
import { requireAuth } from "../middleware/auth.js";

export const matchRoutes = Router();

matchRoutes.use(requireAuth);
matchRoutes.post("/generate", generateMatches);
matchRoutes.get("/", getMatches);
