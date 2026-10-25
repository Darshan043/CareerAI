import { buildAnalytics } from "../agents/feedbackAgent.js";
import { getAll, getOne } from "../services/repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const getAnalytics = asyncHandler(async (req, res) => {
  const [applications, matches, internships, profile, resumeHistory] = await Promise.all([
    getAll("applications", { userId: req.user._id }),
    getAll("matches", { userId: req.user._id }),
    getAll("internships"),
    getOne("profiles", { userId: req.user._id }),
    getAll("resumeHistory", { userId: req.user._id })
  ]);
  res.json({
    analytics: buildAnalytics({ applications, matches, internships, profile, resumeHistory })
  });
});
