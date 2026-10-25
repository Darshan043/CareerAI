import { getById } from "../services/repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { verifyToken } from "../utils/jwt.js";

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const authorization = req.get("authorization") || "";
  const [scheme, token, extra] = authorization.split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    throw httpError(401, "Authentication required.");
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw httpError(401, "Invalid or expired authentication token.");
  }

  if (!payload.sub) throw httpError(401, "Invalid or expired authentication token.");
  const user = await getById("users", payload.sub);
  if (!user) throw httpError(401, "Invalid or expired authentication token.");
  req.user = { _id: String(user._id), name: user.name, email: user.email };
  next();
});
