import { Router } from "express";
import { getInternshipById, getInternships, searchInternships, syncInternships } from "../controllers/internshipController.js";
import { requireAuth } from "../middleware/auth.js";

export const internshipRoutes = Router();

internshipRoutes.use(requireAuth);
internshipRoutes.get("/", getInternships);
internshipRoutes.get("/search", searchInternships);
internshipRoutes.get("/:id", getInternshipById);
internshipRoutes.post("/sync", syncInternships);
