import { Router } from "express";
import {
  approveApplicationMaterial,
  generateApplicationMaterial,
  getApplicationMaterialPdf,
  listApplicationMaterials,
  updateApplicationMaterial
} from "../controllers/applicationMaterialController.js";
import { requireAuth } from "../middleware/auth.js";

export const applicationMaterialRoutes = Router();

applicationMaterialRoutes.use(requireAuth);
applicationMaterialRoutes.get("/", listApplicationMaterials);
applicationMaterialRoutes.post("/generate", generateApplicationMaterial);
applicationMaterialRoutes.post("/approve", approveApplicationMaterial);
applicationMaterialRoutes.patch("/:id", updateApplicationMaterial);
applicationMaterialRoutes.get("/:id/pdf", getApplicationMaterialPdf);
