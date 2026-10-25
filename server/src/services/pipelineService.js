import { discoverInternships } from "../agents/discoveryAgent.js";
import { scoreInternship } from "../agents/matchingAgent.js";
import { getAll, getOne, upsert } from "./repository.js";
import { dedupeInternships, isCurrentInternship } from "../utils/internshipLinks.js";

export async function syncInternshipsForProfile(profile) {
  const discoveries = await discoverInternships(profile);
  for (const internship of discoveries) {
    const filter = { company: internship.company, title: internship.title, applyLink: internship.applyLink };
    try {
      await upsert("internships", filter, internship, internship);
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  const saved = await getAll("internships", {}, { postedDate: -1 });
  const keys = new Set(discoveries.map((item) => `${item.company}|${item.title}|${item.applyLink}`));
  return saved.filter((item) => keys.has(`${item.company}|${item.title}|${item.applyLink}`));
}

export async function regenerateMatches(userId, profile) {
  const internships = dedupeInternships((await getAll("internships", {}, { postedDate: -1 }))
    .filter((internship) => isCurrentInternship(internship)));
  const matches = [];
  for (const internship of internships) {
    const result = await scoreInternship(profile, internship);
    const match = await upsert(
      "matches",
      { userId, internshipId: internship._id },
      { userId, internshipId: internship._id, ...result },
      result
    );
    matches.push({ ...match, internship });
  }
  return matches.sort((left, right) => right.score - left.score);
}
