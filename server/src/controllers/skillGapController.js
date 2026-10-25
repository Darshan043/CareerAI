import { personalizeSkillGapReport } from "../agents/skillGapAgent.js";
import { getById, getOne } from "../services/repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";

export const getSkillGap = asyncHandler(async (req, res) => {
  const [match, profile, internship] = await Promise.all([
    getOne("matches", { userId: req.user._id, internshipId: req.params.internshipId }),
    getOne("profiles", { userId: req.user._id }),
    getById("internships", req.params.internshipId)
  ]);
  if (!match) throw httpError(404, "Generate recommendations for this internship to see its skill roadmap.");
  res.json({ skillGap: await personalizeSkillGapReport(match, profile, internship) });
});
