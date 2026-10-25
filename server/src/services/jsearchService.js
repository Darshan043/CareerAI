import { env } from "../config/env.js";
import { extractSkills, uniqueStrings } from "../utils/text.js";
import { httpError } from "../utils/httpError.js";
import { dedupeInternships, isIndiaListing, mapApplicationLink } from "../utils/internshipLinks.js";

const JSEARCH_URL = "https://jsearch.p.rapidapi.com/search-v2";
const RAPIDAPI_HOST = "jsearch.p.rapidapi.com";
const REQUEST_TIMEOUT_MS = 12_000;
const EMPLOYMENT_TYPES = new Set(["FULLTIME", "CONTRACTOR", "PARTTIME", "INTERN", "TEMPORARY"]);
const POSTED_DATES = new Set(["all", "today", "3days", "week", "month"]);
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const searchCache = new Map();
let unavailableUntil = 0;
const EMPLOYMENT_TYPE_ALIASES = {
  FULLTIME: ["FULLTIME"],
  CONTRACTOR: ["CONTRACT", "CONTRACTOR"],
  PARTTIME: ["PARTTIME"],
  INTERN: ["INTERN", "INTERNSHIP"],
  TEMPORARY: ["TEMP", "TEMPORARY"]
};

function text(value, maxLength) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function matchesEmploymentType(job, employmentType) {
  if (!employmentType) return true;
  const actualType = `${text(job?.job_employment_type, 80)} ${text(job?.job_title, 200)}`
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return EMPLOYMENT_TYPE_ALIASES[employmentType].some((alias) => actualType.includes(alias));
}

export function normalizeJSearchJob(job) {
  const title = text(job?.job_title, 200);
  const company = text(job?.employer_name, 200);
  const applicationLink = mapApplicationLink(job);
  if (!title || !company || !applicationLink || !isIndiaListing(job)) return null;

  const description = text(job.job_description, 20_000);
  const postedAt = job.job_posted_at_datetime_utc ||
    (Number.isFinite(Number(job.job_posted_at_timestamp)) ? Number(job.job_posted_at_timestamp) * 1000 : null);
  const postedDate = postedAt && Number.isFinite(new Date(postedAt).getTime()) ? new Date(postedAt) : null;
  if (!postedDate || postedDate > new Date() || Date.now() - postedDate.getTime() > 45 * 24 * 60 * 60 * 1000) return null;
  const expiresAt = job.job_offer_expiration_datetime_utc
    ? new Date(job.job_offer_expiration_datetime_utc)
    : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) return null;
  const requiredSkills = Array.isArray(job.job_required_skills)
    ? uniqueStrings(job.job_required_skills.map((skill) => text(skill, 80))).slice(0, 40)
    : extractSkills(description);
  const location = [
    text(job.job_city, 100),
    text(job.job_state, 100),
    text(job.job_country, 100)
  ].filter(Boolean).join(", ") || (job.job_is_remote ? "Remote, India" : "India");
  const salaryAmounts = [job.job_min_salary, job.job_max_salary]
    .filter((amount) => amount != null && Number.isFinite(Number(amount)));
  const salary = salaryAmounts.length
    ? `${salaryAmounts.join(" - ")} ${text(job.job_salary_currency, 12)} ${text(job.job_salary_period, 30)}`.trim()
    : "";

  return {
    externalId: text(job.job_id, 200),
    title,
    company,
    description,
    skillsRequired: requiredSkills,
    location,
    country: text(job.job_country, 100),
    employmentType: text(job.job_employment_type, 80),
    salary,
    employerWebsite: toSafeHttps(job.employer_website),
    employerLogo: toSafeHttps(job.employer_logo),
    publisher: text(job.job_publisher, 120),
    remote: Boolean(job.job_is_remote),
    applyLink: applicationLink.applyLink,
    applicationLinkType: applicationLink.applicationLinkType,
    source: "JSearch",
    isSample: false,
    deadline: null,
    expiresAt,
    postedDate,
    embedding: []
  };
}

function toSafeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function cacheKeyFor({ query, location, employmentType, postedDate }) {
  return [query, location, employmentType, postedDate]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function getCached(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function nextUtcMonth() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

function resetTime(response) {
  const raw = response.headers?.get("x-ratelimit-requests-reset");
  const value = Number(raw);
  if (Number.isFinite(value) && value > 0) {
    const timestamp = value > 10_000_000_000 ? value : value * 1000;
    if (timestamp > Date.now()) return timestamp;
  }
  return 0;
}

async function setCooldownForLimit(response) {
  let body = "";
  try {
    body = await response.text();
  } catch {
    // The status code is sufficient to apply a short retry cooldown.
  }
  const monthlyQuota = /monthly.{0,40}quota|quota.{0,40}month|month.{0,40}quota/i.test(body);
  const providerReset = resetTime(response);
  unavailableUntil = Math.max(
    unavailableUntil,
    monthlyQuota
      ? providerReset || nextUtcMonth()
      : providerReset || Date.now() + RATE_LIMIT_COOLDOWN_MS
  );
}

export function isJSearchCoolingDown() {
  if (unavailableUntil <= Date.now()) {
    unavailableUntil = 0;
    return false;
  }
  return true;
}

export function clearJSearchState() {
  searchCache.clear();
  unavailableUntil = 0;
}

export async function searchJSearchJobs(
  { query, location = "India", employmentType = "", postedDate = "week" },
  { fetchImpl = fetch } = {}
) {
  if (!env.jsearchApiKey) throw httpError(503, "Live job search is not configured on the server.");
  if (!query || typeof query !== "string" || query.trim().length < 2 || query.length > 160) {
    throw httpError(400, "Enter a role or keyword between 2 and 160 characters.");
  }
  if (typeof location !== "string" || location.trim().length < 2 || location.length > 100) {
    throw httpError(400, "Enter a location between 2 and 100 characters.");
  }
  const normalizedEmployment = employmentType.toUpperCase();
  if (employmentType && !EMPLOYMENT_TYPES.has(normalizedEmployment)) {
    throw httpError(400, "Choose a supported employment type.");
  }
  const normalizedPostedDate = POSTED_DATES.has(postedDate) ? postedDate : "";
  if (!normalizedPostedDate) throw httpError(400, "Choose a supported posting date.");
  const normalizedLocation = location.trim();
  const cacheKey = cacheKeyFor({
    query,
    location: normalizedLocation,
    employmentType: normalizedEmployment,
    postedDate: normalizedPostedDate
  });
  const cached = getCached(cacheKey);
  if (cached) return cached;
  if (isJSearchCoolingDown()) {
    throw httpError(429, "JSearch is temporarily rate-limited; using the backup job source.");
  }

  const searchText = /\bintern(?:ship)?\b/i.test(query) || normalizedEmployment !== "INTERN"
    ? query.trim()
    : `${query.trim()} internship`;
  const params = new URLSearchParams({
    query: `${searchText} in ${normalizedLocation}`,
    num_pages: "1",
    country: "in",
    language: "en",
    date_posted: normalizedPostedDate,
    page: "1"
  });
  if (normalizedEmployment) params.set("employment_types", normalizedEmployment);

  let response;
  try {
    response = await fetchImpl(`${JSEARCH_URL}?${params}`, {
      headers: {
        "X-RapidAPI-Key": env.jsearchApiKey,
        "X-RapidAPI-Host": RAPIDAPI_HOST
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw httpError(502, "Live job search is temporarily unavailable. Please try again.");
  }
  if (response.status === 429) {
    await setCooldownForLimit(response);
    throw httpError(429, "JSearch rate limit reached. Using the backup job source.");
  }
  if (response.status === 401 || response.status === 403) {
    throw httpError(503, "JSearch is not available with the current server configuration.");
  }
  if (!response.ok) throw httpError(502, "JSearch could not complete this search.");

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw httpError(502, "JSearch returned an invalid response.");
  }
  const listings = Array.isArray(payload?.data) ? payload.data : payload?.data?.jobs;
  if (!Array.isArray(listings)) throw httpError(502, "JSearch returned an unexpected response.");

  const freshnessDays = { today: 1, "3days": 3, week: 7, month: 31, all: 45 }[normalizedPostedDate];
  const cutoff = Date.now() - freshnessDays * 24 * 60 * 60 * 1000;
  const result = {
    internships: dedupeInternships(listings
    .filter((job) => matchesEmploymentType(job, normalizedEmployment))
    .map(normalizeJSearchJob)
    .filter((job) => job && job.postedDate.getTime() >= cutoff))
      .slice(0, 20),
    nextCursor: typeof payload.data?.cursor === "string" ? payload.data.cursor : ""
  };
  setCached(cacheKey, result);
  return result;
}

export { searchHimalayasJobs, normalizeHimalayasJob, clearHimalayasCache } from "./himalayasService.js";
