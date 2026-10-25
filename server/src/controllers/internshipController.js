import { getAll, getById, getOne, upsert } from "../services/repository.js";
import { syncInternshipsForProfile } from "../services/pipelineService.js";
import { searchJobListings } from "../services/jobSearchService.js";
import { scoreInternship } from "../agents/matchingAgent.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { dedupeInternships, isCurrentInternship, isSpecificListingUrl, safeHttpsUrl } from "../utils/internshipLinks.js";

async function withUserMatch(internship, userId) {
  const match = await getOne("matches", { userId, internshipId: internship._id });
  return { ...internship, match: match || null };
}

export const getInternships = asyncHandler(async (req, res) => {
  const [internships, matches] = await Promise.all([
    getAll("internships", {}, { postedDate: -1 }),
    getAll("matches", { userId: req.user._id })
  ]);
  const visible = dedupeInternships(internships.filter((internship) => isCurrentInternship(internship)));
  const matchesByInternship = new Map(matches.map((match) => [String(match.internshipId), match]));
  res.json({ internships: visible.map((internship) => ({
    ...internship,
    applyLink: safeHttpsUrl(internship.applyLink) && isSpecificListingUrl(internship.applyLink) ? internship.applyLink : "",
    applicationLinkType: internship.applicationLinkType === "direct" ? "direct" : "platform",
    match: matchesByInternship.get(String(internship._id)) || null
  })) });
});

export const getInternshipById = asyncHandler(async (req, res) => {
  const internship = await getById("internships", req.params.id);
  if (!internship) throw httpError(404, "Internship not found.");
  const enriched = await withUserMatch(internship, req.user._id);
  const validLink = safeHttpsUrl(internship.applyLink) && isSpecificListingUrl(internship.applyLink);
  res.json({ internship: {
    ...enriched,
    applyLink: validLink ? internship.applyLink : "",
    applicationLinkType: internship.applicationLinkType === "direct" ? "direct" : "platform"
  } });
});

export const searchInternships = asyncHandler(async (req, res) => {
  const { query, location = "India", employmentType = "", postedDate = "week", cursor = "" } = req.query;
  if (
    typeof query !== "string" ||
    typeof location !== "string" ||
    typeof employmentType !== "string" ||
    typeof postedDate !== "string" ||
    typeof cursor !== "string"
  ) {
    throw httpError(400, "Search filters must be single text values.");
  }
  const profile = await getOne("profiles", { userId: req.user._id });
  const { internships: discovered, nextCursor, providerStatus } = await searchJobListings({
    query,
    location,
    employmentType,
    postedDate,
    cursor
  });
  const internships = [];
  for (const internship of discovered) {
    const filter = internship.externalId
      ? { source: internship.source || "Himalayas", externalId: internship.externalId }
      : { company: internship.company, title: internship.title, applyLink: internship.applyLink };
    const saved = await upsert("internships", filter, internship, internship);
    const match = profile?.resumeText || profile?.skills?.length || profile?.preferences?.roles?.length
      ? await scoreInternship(profile, saved)
      : null;
    if (match) {
      await upsert(
        "matches",
        { userId: req.user._id, internshipId: saved._id },
        { userId: req.user._id, internshipId: saved._id, ...match },
        match
      );
    }
    internships.push({ ...saved, match, locationMatch: internship.locationMatch });
  }
  res.json({
    query: query.trim(),
    location: location.trim(),
    count: internships.length,
    internships,
    nextCursor,
    providerStatus
  });
});

export const syncInternships = asyncHandler(async (req, res) => {
  const profile = await getOne("profiles", { userId: req.user._id });
  if (!profile) throw httpError(404, "Create a profile before searching for internships.");
  const internships = await syncInternshipsForProfile(profile);
  res.json({ count: internships.length, internships });
});
