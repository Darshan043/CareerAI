import { Router } from "express";
import { getNotifications, markNotificationRead } from "../controllers/notificationController.js";
import { requireAuth } from "../middleware/auth.js";

export const notificationRoutes = Router();

notificationRoutes.use(requireAuth);
notificationRoutes.get("/", getNotifications);
notificationRoutes.patch("/:id/read", markNotificationRead);
