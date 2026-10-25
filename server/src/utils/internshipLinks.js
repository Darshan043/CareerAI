const INDIA_COUNTRY = /^(?:in|india)$/i;
const INDIA_REMOTE_ACCESS = /\b(?:india|worldwide|anywhere|asia(?:-pacific)?|apac)\b/i;
const GENERIC_PATH = /\/(?:jobs?\/)?(?:search|jobs|internships?|careers?|job-listings?)(?:\/)?$/i;
const GENERIC_SEARCH_PATH = /\/(?:jobs?|internships?|careers?)[-_/](?:search|results|browse|list)(?:[-/]|$)/i;

export function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function isIndiaListing(job) {
  const country = String(job?.job_country || job?.country || "").trim();
  if (INDIA_COUNTRY.test(country)) return true;
  if (!job?.job_is_remote && !job?.remote) return false;
  if (Array.isArray(job?.locationRestrictions) && job.locationRestrictions.length === 0) return true;
  const location = [
    job?.candidate_required_location,
    job?.job_location,
    job?.location,
    ...(Array.isArray(job?.locationRestrictions) ? job.locationRestrictions : [])
  ].filter(Boolean).join(" ");
  return INDIA_REMOTE_ACCESS.test(location);
}

export function isInternshipListing(job) {
  const title = String(job?.job_title || job?.title || "");
  const types = [job?.job_employment_type, ...(Array.isArray(job?.job_employment_types) ? job.job_employment_types : [])]
    .filter(Boolean).join(" ");
  const type = String(job?.job_type || job?.employmentType || "");
  const categories = Array.isArray(job?.categories) ? job.categories.join(" ") : "";
  return /\bintern(?:ship)?\b/i.test(title) || /\bintern\b/i.test(types) || /\bintern(?:ship)?\b/i.test(type) || /\bintern(?:ship)?\b/i.test(categories);
}

export function isSpecificListingUrl(value) {
  const safeUrl = safeHttpsUrl(value);
  if (!safeUrl) return false;
  const url = new URL(safeUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;
  if (GENERIC_PATH.test(path) || GENERIC_SEARCH_PATH.test(path) || /(?:^|\/)(?:search|browse|collections?)(?:\/|$)/i.test(path)) return false;
  if ([...url.searchParams.keys()].some((key) => /^(?:q|query|keywords?|location|search)$/i.test(key))) return false;

  if (host.endsWith("linkedin.com")) return /\/jobs\/view\/(?:[^/]*\d[^/]*)\/?$/i.test(path);
  if (host.endsWith("internshala.com")) return /\/internship\/detail\//i.test(path) || /\/internships\/[^/]+\/\d{5,}/i.test(path);
  if (host.endsWith("indeed.com")) return /\/viewjob\/?$/i.test(path) && Boolean(url.searchParams.get("jk"));
  if (host.endsWith("glassdoor.com")) return /\/(?:job-listing|partner\/jobListing)/i.test(path) || Boolean(url.searchParams.get("jl"));
  if (host.endsWith("remotive.com")) return /^\/remote-jobs\/[^/]+\/[^/]+/i.test(path);
  if (host.endsWith("wellfound.com")) return /^\/jobs\/[^/]+/i.test(path);
  if (host.endsWith("himalayas.app")) return /^\/companies\/[^/]+\/jobs\/[^/]+/i.test(path);
  if (host.endsWith("google.com") && url.searchParams.get("udm") === "8") return /docid%3D|docid=/i.test(url.hash);

  const segments = path.split("/").filter(Boolean);
  return segments.length >= 2 || /\/(?:apply|application)\//i.test(path) || Boolean(url.searchParams.get("job_id") || url.searchParams.get("jobId"));
}

function isExplicitDirectUrl(value) {
  const safeUrl = safeHttpsUrl(value);
  if (!safeUrl) return false;
  const url = new URL(safeUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const knownJobPlatforms = ["linkedin.com", "internshala.com", "indeed.com", "glassdoor.com", "remotive.com", "wellfound.com", "himalayas.app"];
  if (knownJobPlatforms.some((domain) => host.endsWith(domain))) return isSpecificListingUrl(safeUrl);
  if (GENERIC_PATH.test(url.pathname) || GENERIC_SEARCH_PATH.test(url.pathname) ||
    [...url.searchParams.keys()].some((key) => /^(?:q|query|keywords?|location|search)$/i.test(key))) return false;
  return true;
}

export function mapApplicationLink(job) {
  const primary = safeHttpsUrl(job?.job_apply_link);
  const options = Array.isArray(job?.apply_options) ? job.apply_options : [];
  const directOption = options.find((option) => option?.is_direct === true && isExplicitDirectUrl(option.apply_link));
  if (directOption) {
    return { applyLink: safeHttpsUrl(directOption.apply_link), applicationLinkType: "direct" };
  }
  if (job?.job_apply_is_direct === true && primary && isExplicitDirectUrl(primary)) {
    return { applyLink: primary, applicationLinkType: "direct" };
  }

  const platformOption = options.find((option) => isSpecificListingUrl(option?.apply_link));
  const platformLink = platformOption ? safeHttpsUrl(platformOption.apply_link) : primary;
  if (isSpecificListingUrl(platformLink)) {
    return { applyLink: platformLink, applicationLinkType: "platform" };
  }

  const googleListing = safeHttpsUrl(job?.job_google_link);
  if (isSpecificListingUrl(googleListing)) {
    return { applyLink: googleListing, applicationLinkType: "platform" };
  }
  return null;
}

export function isCurrentInternship(internship, now = Date.now()) {
  if (!internship || internship.isSample) return false;
  if (!isIndiaListing({
    country: internship.country,
    remote: internship.remote,
    location: internship.location
  })) return false;
  if (!isInternshipListing({
    title: internship.title,
    job_employment_type: internship.employmentType
  })) return false;
  const posted = new Date(internship.postedDate || "").getTime();
  if (!Number.isFinite(posted) || posted > now || now - posted > 45 * 24 * 60 * 60 * 1000) return false;
  const expires = internship.expiresAt ? new Date(internship.expiresAt).getTime() : null;
  if (expires !== null && (!Number.isFinite(expires) || expires <= now)) return false;
  return Boolean(safeHttpsUrl(internship.applyLink) && isSpecificListingUrl(internship.applyLink));
}

export function dedupeInternships(internships) {
  const byIdentity = new Map();
  for (const internship of internships) {
    const company = String(internship.company || "").toLowerCase().trim();
    const title = String(internship.title || "").toLowerCase().trim();
    const location = String(internship.location || "")
      .toLowerCase()
      .replace(/\b(?:india|in)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const applicationUrl = safeHttpsUrl(internship.applyLink);
    const applicationIdentity = applicationUrl
      ? `${new URL(applicationUrl).hostname.toLowerCase()}${new URL(applicationUrl).pathname.replace(/\/+$/, "").toLowerCase()}`
      : "";
    const key = company && title
      ? `${company}|${title}|${location}`
      : applicationIdentity || `${String(internship.source).toLowerCase()}|${String(internship.externalId).toLowerCase()}`;
    const current = byIdentity.get(key);
    const directWins = internship.applicationLinkType === "direct" && current?.applicationLinkType !== "direct";
    const newerWins = new Date(internship.postedDate || 0).getTime() > new Date(current?.postedDate || 0).getTime();
    if (!current || directWins || (internship.applicationLinkType === current.applicationLinkType && newerWins)) {
      byIdentity.set(key, internship);
    }
  }
  return [...byIdentity.values()];
}
