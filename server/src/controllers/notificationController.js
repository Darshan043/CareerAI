import { getAll, getOne, updateById } from "../services/repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";

export const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await getAll("notifications", { userId: req.user._id }, { createdAt: -1 });
  res.json({ notifications });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await getOne("notifications", { _id: req.params.id, userId: req.user._id });
  if (!notification) throw httpError(404, "Notification not found.");
  const updated = notification.read ? notification : await updateById("notifications", notification._id, { read: true });
  res.json({ notification: updated });
});
