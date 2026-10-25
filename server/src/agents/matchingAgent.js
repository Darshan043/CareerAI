import { normalizeSkill, uniqueStrings } from "../utils/text.js";

export async function scoreInternship(profile, internship) {
  const profileSkills = new Set((profile.skills || []).map(normalizeSkill).filter(Boolean));
  const requiredSkills = uniqueStrings(internship.skillsRequired || []).map(normalizeSkill);
  const matchedSkills = requiredSkills.filter((skill) => profileSkills.has(skill));
  const missingSkills = requiredSkills.filter((skill) => !profileSkills.has(skill));
  const skillScore = requiredSkills.length ? Math.round((matchedSkills.length / requiredSkills.length) * 80) : 0;
  const roles = (profile.preferences?.roles || []).map((role) => normalizeSkill(role));
  const roleContext = `${internship.title} ${internship.description}`.toLowerCase();
  const roleBoost = roles.some((role) => role && roleContext.includes(role)) ? 10 : 0;
  const requestedLocation = normalizeSkill(profile.preferences?.location || "");
  const requestedWorkMode = normalizeSkill(profile.preferences?.workMode || "");
  const listingLocation = normalizeSkill(internship.location || "");
  const isRemote = internship.remote === true || /remote|worldwide/i.test(listingLocation);
  const locationMatches = !requestedLocation || /remote|anywhere/i.test(requestedLocation)
    ? !/remote|anywhere/i.test(requestedLocation) || isRemote
    : listingLocation.includes(requestedLocation);
  const workModeMatches = !requestedWorkMode ||
    (requestedWorkMode === "remote" && isRemote) ||
    (requestedWorkMode === "on-site" && !isRemote) ||
    (requestedWorkMode === "hybrid" && /hybrid/i.test(listingLocation));
  const locationBoost = (requestedLocation || requestedWorkMode) && locationMatches && workModeMatches ? 10 : 0;
  const score = Math.min(100, skillScore + roleBoost + locationBoost);
  const fallback = `Heuristic fit score ${score}/100 (not hiring probability): resume skill overlap ${matchedSkills.length}/${requiredSkills.length} contributes ${skillScore}/80, role preference ${roleBoost}/10, and location/work-mode preference ${locationBoost}/10.` +
    (missingSkills.length ? ` Skills to build: ${missingSkills.slice(0, 3).join(", ")}.` : "");
  return {
    score,
    scoreBreakdown: { skills: skillScore, role: roleBoost, location: locationBoost },
    matchedSkills,
    missingSkills,
    reason: fallback.slice(0, 2000)
  };
}
