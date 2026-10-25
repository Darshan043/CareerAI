import { getAll, getOne } from "../services/repository.js";
import { regenerateMatches, syncInternshipsForProfile } from "../services/pipelineService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { dedupeInternships, isCurrentInternship } from "../utils/internshipLinks.js";

export const generateMatches = asyncHandler(async (req, res) => {
  const profile = await getOne("profiles", { userId: req.user._id });
  if (!profile?.resumeText) throw httpError(400, "Upload a resume before generating recommendations.");
  await syncInternshipsForProfile(profile);
  const matches = await regenerateMatches(req.user._id, profile);
  res.json({ matches });
});

export const getMatches = asyncHandler(async (req, res) => {
  const matches = await getAll("matches", { userId: req.user._id }, { score: -1 });
  const joined = await Promise.all(matches.map(async (match) => {
    const internship = await getOne("internships", { _id: match.internshipId });
    return internship ? { ...match, internship } : null;
  }));
  const current = joined.filter((entry) => entry && isCurrentInternship(entry.internship));
  const unique = dedupeInternships(current.map((entry) => ({ ...entry.internship, __match: entry })));
  res.json({ matches: unique.map((internship) => internship.__match) });
});
