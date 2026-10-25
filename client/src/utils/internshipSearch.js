export function getRecommendationRoles(profile) {
  const preferredRoles = [...new Set((profile?.preferences?.roles || [])
    .map((role) => String(role).trim())
    .filter(Boolean))].slice(0, 3);
  if (preferredRoles.length >= 3) return preferredRoles;

  const resumeContext = [
    profile?.resumeSummary,
    profile?.headline,
    profile?.resumeText,
    ...(profile?.skills || []),
    ...(profile?.projects || []),
    ...(profile?.experience || [])
  ].filter(Boolean).join(" ").toLowerCase();

  const inferred = [];
  if (/\b(machine learning|ai|model|deep learning|nlp)\b/.test(resumeContext)) inferred.push("AI Engineering");
  if (/\b(react|javascript|frontend|web|full-stack|full stack)\b/.test(resumeContext)) inferred.push("Full-Stack Development");
  if (/\b(data analyst|data analysis|sql|power bi|tableau)\b/.test(resumeContext)) inferred.push("Data Analyst");
  if (/\b(cloud|devops|aws|azure|docker)\b/.test(resumeContext)) inferred.push("Cloud Engineering");

  const combined = [...new Set([...preferredRoles, ...inferred])];
  if (combined.length) return combined.slice(0, 3);
  return ["Software Engineering"];
}

export function mergeListings(pages) {
  const listings = new Map();
  pages.forEach((page, roleOrder) => {
    for (const internship of page.internships || []) {
      const key = internship._id || internship.externalId || `${internship.company}:${internship.title}:${internship.location}`;
      const previous = listings.get(key);
      const candidate = { ...internship, recommendationRoleOrder: roleOrder };
      if (!previous || (internship.match?.score || 0) > (previous.match?.score || 0)) {
        listings.set(key, {
          ...candidate,
          recommendationRoleOrder: roleOrder
        });
      }
    }
  });
  return [...listings.values()].sort((left, right) =>
    left.recommendationRoleOrder - right.recommendationRoleOrder ||
    (right.match?.score || 0) - (left.match?.score || 0)
  );
}

export async function fetchInternshipPages(searches, searchFn) {
  const settled = await Promise.allSettled(searches.map((filters) => searchFn(filters)));
  const pages = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!pages.length) {
    const failure = settled.find((result) => result.status === "rejected")?.reason;
    const error = new Error(failure?.response?.data?.message || "Live internship search is temporarily unavailable.");
    error.response = failure?.response;
    throw error;
  }
  const nextSearches = searches.flatMap((search, index) => {
    const result = settled[index];
    if (result.status === "fulfilled" && result.value?.nextCursor) {
      return [{ ...search, cursor: result.value.nextCursor }];
    }
    return [];
  });
  return {
    internships: mergeListings(pages),
    failedSearches: settled.filter((result) => result.status === "rejected").length,
    nextSearches
  };
}

export async function fetchNextInternshipPages(searches, searchFn) {
  const settled = await Promise.allSettled(searches.map((filters) => searchFn(filters)));
  const pages = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const nextSearches = searches.map((search, index) => {
    const result = settled[index];
    if (result.status === "fulfilled") {
      return result.value?.nextCursor ? { ...search, cursor: result.value.nextCursor } : null;
    }
    return search;
  }).filter(Boolean);
  return {
    internships: mergeListings(pages),
    failedSearches: settled.filter((result) => result.status === "rejected").length,
    nextSearches
  };
}
