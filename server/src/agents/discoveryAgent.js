import { env } from "../config/env.js";
import { extractSkills, uniqueStrings } from "../utils/text.js";
import { dedupeInternships, isIndiaListing, isInternshipListing, isSpecificListingUrl, safeHttpsUrl } from "../utils/internshipLinks.js";

const MAX_RESULTS = 10;
const LIVE_FETCH_TIMEOUT_MS = 5000;
const LIVE_CACHE_TTL = 6 * 60 * 60 * 1000;
let liveCache = { expiresAt: 0, postings: [] };

function relevanceScore(profile, internship) {
  const skills = new Set((profile.skills || []).map((skill) => String(skill).toLowerCase()));
  const overlap = (internship.skillsRequired || []).filter((skill) => skills.has(String(skill).toLowerCase())).length;
  const roleTerms = (profile.preferences?.roles || []).map((role) => role.toLowerCase());
  const roleText = `${internship.title} ${internship.description}`.toLowerCase();
  const roleHit = roleTerms.some((role) => roleText.includes(role));
  return overlap * 3 + (roleHit ? 4 : 0);
}

export function normalizeRemotive(job) {
  const description = String(job.description || "").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ").trim().slice(0, 20000);
  const postedDate = new Date(job.publication_date);
  if (!Number.isFinite(postedDate.getTime()) || Date.now() - postedDate.getTime() > 45 * 24 * 60 * 60 * 1000) return null;
  const applyLink = safeHttpsUrl(job.url);
  if (!applyLink || !isSpecificListingUrl(applyLink)) return null;
  const location = String(job.candidate_required_location || "").trim();
  if (!isIndiaListing({ job_is_remote: true, candidate_required_location: location })) return null;
  const title = String(job.title || "").trim();
  if (!isInternshipListing({ title, job_type: job.job_type })) return null;
  const company = String(job.company_name || "").trim();
  if (!title || !company) return null;
  return {
    externalId: String(job.id || ""),
    title: title.slice(0, 200),
    company: company.slice(0, 200),
    description,
    skillsRequired: uniqueStrings(extractSkills(description)),
    location: /worldwide|anywhere/i.test(location) ? "Remote, Worldwide" : location,
    country: "India",
    employmentType: "INTERNSHIP",
    remote: true,
    applyLink,
    applicationLinkType: "platform",
    source: "Remotive",
    publisher: "Remotive",
    isSample: false,
    deadline: null,
    postedDate,
    embedding: []
  };
}

async function fetchLiveInternships() {
  if (!env.enableLiveDiscovery) return [];
  if (Date.now() < liveCache.expiresAt) return liveCache.postings;
  try {
    const response = await fetch("https://remotive.com/api/remote-jobs?limit=200", {
      signal: AbortSignal.timeout(LIVE_FETCH_TIMEOUT_MS),
      headers: { "user-agent": "CareerPilot-AI internship discovery" }
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const postings = (Array.isArray(payload.jobs) ? payload.jobs : []).map(normalizeRemotive).filter(Boolean);
    liveCache = { expiresAt: Date.now() + LIVE_CACHE_TTL, postings: dedupeInternships(postings) };
    return liveCache.postings;
  } catch {
    return [];
  }
}

export async function discoverInternships(profile = {}) {
  const live = await fetchLiveInternships();
  return dedupeInternships(live)
    .sort((left, right) => relevanceScore(profile, right) - relevanceScore(profile, left) ||
      right.postedDate.getTime() - left.postedDate.getTime())
    .slice(0, MAX_RESULTS);
}
