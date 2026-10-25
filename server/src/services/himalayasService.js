import { env } from "../config/env.js";
import { extractSkills, uniqueStrings } from "../utils/text.js";
import { httpError } from "../utils/httpError.js";
import { dedupeInternships, isIndiaListing, isInternshipListing, isSpecificListingUrl, safeHttpsUrl } from "../utils/internshipLinks.js";

const HIMALAYAS_SEARCH_URL = "https://himalayas.app/jobs/api/search";
const REQUEST_TIMEOUT_MS = 12_000;
const EMPLOYMENT_TYPES = new Set(["FULLTIME", "CONTRACTOR", "PARTTIME", "INTERN", "TEMPORARY"]);
const POSTED_DATES = new Set(["all", "today", "3days", "week", "month"]);

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const searchCache = new Map();

function text(value, maxLength) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function toSafeHttps(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function getFromCache(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache(key, data) {
  if (searchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function clearHimalayasCache() {
  searchCache.clear();
}

export function matchesEmploymentType(job, employmentType) {
  if (!employmentType) return true;
  const requested = employmentType.toUpperCase();
  const actual = String(job?.employmentType || "").toUpperCase();
  const title = String(job?.title || "").toUpperCase();

  if (requested === "INTERN") {
    return actual.includes("INTERN") || /\bINTERN(?:SHIP)?\b/.test(title);
  }
  if (requested === "FULLTIME") {
    return actual.includes("FULL");
  }
  if (requested === "PARTTIME") {
    return actual.includes("PART");
  }
  if (requested === "CONTRACTOR") {
    return actual.includes("CONTRACT") || actual.includes("FREELANCE");
  }
  if (requested === "TEMPORARY") {
    return actual.includes("TEMP");
  }
  return true;
}

export function normalizeHimalayasJob(job) {
  const title = text(job?.title, 200);
  const company = text(job?.companyName, 200);
  const applicationLink = safeHttpsUrl(job?.applicationLink);

  if (!title || !company || !applicationLink || !isSpecificListingUrl(applicationLink)) return null;

  // Verify India or Worldwide remote eligibility
  const restrictions = Array.isArray(job?.locationRestrictions) ? job.locationRestrictions : [];
  const isWorldwide = restrictions.length === 0;
  const allowsIndia = isWorldwide || isIndiaListing({
    remote: true,
    locationRestrictions: restrictions,
    candidate_required_location: restrictions.join(" ")
  });
  if (!allowsIndia) return null;

  // Dates and freshness (up to 45 days max)
  const postedAt = job?.pubDate ? Number(job.pubDate) * 1000 : null;
  const postedDate = postedAt && Number.isFinite(postedAt) ? new Date(postedAt) : new Date();
  if (postedDate > new Date() || Date.now() - postedDate.getTime() > 45 * 24 * 60 * 60 * 1000) return null;

  const expiresAt = job?.expiryDate ? new Date(Number(job.expiryDate) * 1000) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) return null;

  // Employment type mapping
  const rawType = String(job?.employmentType || "").trim();
  const upperType = rawType.toUpperCase();
  let normalizedType = "INTERN";
  if (upperType.includes("FULL")) normalizedType = "FULLTIME";
  else if (upperType.includes("PART")) normalizedType = "PARTTIME";
  else if (upperType.includes("CONTRACT") || upperType.includes("FREELANCE")) normalizedType = "CONTRACTOR";
  else if (upperType.includes("TEMP")) normalizedType = "TEMPORARY";
  else if (upperType.includes("INTERN") || /\bintern(?:ship)?\b/i.test(title)) normalizedType = "INTERN";
  else normalizedType = rawType || "INTERN";

  // Skills and description
  const description = text(job?.description || job?.excerpt, 20_000);
  const categories = Array.isArray(job?.categories)
    ? job.categories.map((c) => String(c).replace(/[-_]/g, " "))
    : [];
  const categorySkills = categories.filter((c) => !/jobs?|contract|freelance|specialist|intern(?:ship)?/i.test(c));
  const extracted = extractSkills(description);
  const seenSkillKeys = new Set();
  const skillsRequired = [];
  for (const skill of [...categorySkills, ...extracted]) {
    const key = String(skill).trim().toLowerCase();
    if (key && !seenSkillKeys.has(key)) {
      seenSkillKeys.add(key);
      skillsRequired.push(String(skill).trim());
    }
  }

  // Location text
  const city = text(job?.city || job?.job_city, 100);
  const state = text(job?.state || job?.job_state, 100);
  const rawLocation = text(job?.location, 100);

  let location = "Remote";
  if (rawLocation) {
    location = rawLocation;
  } else if (city || state) {
    location = [city, state, "India (Remote)"].filter(Boolean).join(", ");
  } else if (restrictions.some((loc) => /india/i.test(String(loc)))) {
    location = "India (Remote)";
  } else if (isWorldwide) {
    location = "Remote, Worldwide";
  } else if (restrictions.length > 0) {
    location = `Remote (${restrictions.slice(0, 3).join(", ")})`;
  }

  // Salary formatting
  const minSal = job?.minSalary;
  const maxSal = job?.maxSalary;
  const curr = text(job?.currency, 10);
  const period = text(job?.salaryPeriod, 20);
  let salary = "";
  if (minSal != null && Number.isFinite(Number(minSal))) {
    if (maxSal != null && Number.isFinite(Number(maxSal)) && Number(maxSal) !== Number(minSal)) {
      salary = `${curr ? curr + " " : ""}${minSal} - ${maxSal}${period ? " / " + period : ""}`.trim();
    } else {
      salary = `${curr ? curr + " " : ""}${minSal}${period ? " / " + period : ""}`.trim();
    }
  }

  const companySlug = text(job?.companySlug, 100);

  return {
    externalId: text(job?.guid || job?.applicationLink, 200),
    title,
    company,
    description,
    skillsRequired,
    location,
    country: restrictions.some((loc) => /india/i.test(String(loc))) ? "India" : (isWorldwide ? "Worldwide" : "India"),
    employmentType: normalizedType,
    salary,
    employerWebsite: companySlug ? `https://himalayas.app/companies/${companySlug}` : "",
    employerLogo: toSafeHttps(job?.companyLogo),
    publisher: "Himalayas",
    remote: true,
    applyLink: applicationLink,
    applicationLinkType: "platform",
    source: "Himalayas",
    isSample: false,
    deadline: expiresAt,
    expiresAt,
    postedDate,
    embedding: []
  };
}

export async function searchHimalayasJobs(
  { query, location = "India", employmentType = "", postedDate = "week", cursor = "" },
  { fetchImpl = fetch } = {}
) {
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

  const offset = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0;
  const cacheKey = `${query.toLowerCase().trim()}|${location.toLowerCase().trim()}|${normalizedEmployment}|${normalizedPostedDate}|${offset}`;

  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const isInternshipRequested = normalizedEmployment === "INTERN";
  const searchQ = isInternshipRequested && !/\bintern(?:ship)?\b/i.test(query)
    ? `${query.trim()} intern`
    : query.trim();

  const params = new URLSearchParams({
    q: searchQ,
    limit: "20"
  });
  if (offset > 0) {
    params.set("offset", String(offset));
  }

  const nonIndiaCountries = /^(?:united states|us|uk|united kingdom|canada|germany|france|australia|singapore|japan)$/i;
  const isSpecificOtherCountry = nonIndiaCountries.test(location.trim());
  if (!isSpecificOtherCountry) {
    params.set("country", "India");
  }

  const headers = {};
  if (env.himalayasApiKey) {
    headers["Authorization"] = `Bearer ${env.himalayasApiKey}`;
  }

  let response;
  try {
    response = await fetchImpl(`${HIMALAYAS_SEARCH_URL}?${params}`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch {
    throw httpError(502, "Live job search is temporarily unavailable. Please try again.");
  }

  if (response.status === 429) {
    throw httpError(429, "Himalayas rate limit reached. Please try again later.");
  }
  if (response.status === 401 || response.status === 403) {
    throw httpError(503, "Himalayas is not available with the current server configuration.");
  }
  if (!response.ok) {
    throw httpError(502, "Himalayas could not complete this search.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw httpError(502, "Himalayas returned an invalid response.");
  }

  const jobsList = Array.isArray(payload?.jobs) ? payload.jobs : [];
  const freshnessDays = { today: 1, "3days": 3, week: 7, month: 31, all: 45 }[normalizedPostedDate];
  const cutoff = Date.now() - freshnessDays * 24 * 60 * 60 * 1000;

  const internships = dedupeInternships(
    jobsList
      .map(normalizeHimalayasJob)
      .filter(Boolean)
      .filter((job) => matchesEmploymentType(job, normalizedEmployment))
      .filter((job) => job.postedDate.getTime() >= cutoff)
  ).slice(0, 20);

  const totalCount = Number(payload?.totalCount || 0);
  const nextOffset = offset + jobsList.length;
  const nextCursor = jobsList.length > 0 && nextOffset < totalCount ? String(nextOffset) : "";

  const result = {
    internships,
    nextCursor
  };

  setInCache(cacheKey, result);
  return result;
}
