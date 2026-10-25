import { httpError } from "../utils/httpError.js";
import { dedupeInternships } from "../utils/internshipLinks.js";
import { searchHimalayasJobs } from "./himalayasService.js";
import { searchJSearchJobs } from "./jsearchService.js";

function normalized(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function classifyJobLocation(job, requestedLocation) {
  const location = normalized(requestedLocation);
  const listingLocation = normalized([
    job.location,
    job.city,
    job.state,
    job.country
  ].filter(Boolean).join(" "));
  const exactLocation = location && location !== "india" && listingLocation.includes(location);
  if (exactLocation && !job.remote) return "exact";
  if (job.remote) return "remote";
  return "india";
}

function withLocationMatch(results, requestedLocation) {
  return results.map((job) => ({
    ...job,
    locationMatch: classifyJobLocation(job, requestedLocation)
  }));
}

export async function searchJobListings(filters, options = {}) {
  const providerResults = [];
  let jsearchAvailable = false;
  let jsearchError;
  let himalayasError;

  if (filters.cursor) {
    jsearchAvailable = true;
  } else {
    try {
      const result = await searchJSearchJobs(filters, options);
      providerResults.push(result);
      jsearchAvailable = true;
    } catch (error) {
      if (error.status === 400) throw error;
      jsearchError = error;
    }
  }

  try {
    providerResults.push(await searchHimalayasJobs(filters, options));
  } catch (error) {
    if (error.status === 400) throw error;
    himalayasError = error;
  }

  if (!providerResults.length) {
    throw himalayasError || jsearchError || httpError(502, "Job search is temporarily unavailable.");
  }

  const internships = dedupeInternships(providerResults.flatMap((result) => result.internships || []));
  internships.sort((left, right) => {
    const rank = { exact: 0, remote: 1, india: 2 };
    return rank[classifyJobLocation(left, filters.location)] - rank[classifyJobLocation(right, filters.location)] ||
      new Date(right.postedDate).getTime() - new Date(left.postedDate).getTime();
  });

  return {
    internships: withLocationMatch(internships, filters.location),
    nextCursor: providerResults.find((result) => result.nextCursor)?.nextCursor || "",
    providerStatus: jsearchAvailable ? "combined" : "himalayas-fallback"
  };
}
