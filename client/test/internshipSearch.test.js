import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchInternshipPages,
  fetchNextInternshipPages,
  getRecommendationRoles
} from "../src/utils/internshipSearch.js";

test("recommendations prioritize saved roles and otherwise infer roles from resume context", () => {
  assert.deepEqual(
    getRecommendationRoles({
      preferences: { roles: ["AI Engineering", "Full-Stack Development", "Data Analyst", "Designer"] },
      resumeSummary: "Experienced data analyst"
    }),
    ["AI Engineering", "Full-Stack Development", "Data Analyst"]
  );
  assert.deepEqual(
    getRecommendationRoles({
      preferences: { roles: ["Data Analyst"] },
      resumeSummary: "Built machine learning models",
      skills: ["SQL"]
    }),
    ["Data Analyst", "AI Engineering"]
  );
  assert.deepEqual(
    getRecommendationRoles({ resumeSummary: "Built machine learning models", skills: ["React", "SQL"] }),
    ["AI Engineering", "Full-Stack Development", "Data Analyst"]
  );
  assert.deepEqual(getRecommendationRoles({}), ["Software Engineering"]);
});

test("profile role searches keep successful results when one role request fails", async () => {
  const requests = [
    { query: "AI Engineering" },
    { query: "Full-Stack Development" },
    { query: "Data Analyst" }
  ];
  const data = {
    "AI Engineering": {
      internships: [{ _id: "ai", match: { score: 82 } }, { _id: "shared", match: { score: 60 } }],
      nextCursor: "ai-cursor"
    },
    "Full-Stack Development": {
      internships: [{ _id: "full-stack", match: { score: 72 } }, { _id: "shared", match: { score: 65 } }],
      nextCursor: "full-stack-cursor"
    }
  };
  const result = await fetchInternshipPages(requests, async ({ query }) => {
    if (query === "Data Analyst") throw new Error("temporary provider failure");
    return data[query];
  });

  assert.deepEqual(result.internships.map((listing) => listing._id), ["ai", "full-stack", "shared"]);
  assert.equal(result.internships[2].match.score, 65);
  assert.equal(result.failedSearches, 1);
  assert.deepEqual(result.nextSearches, [
    { ...requests[0], cursor: "ai-cursor" },
    { ...requests[1], cursor: "full-stack-cursor" }
  ]);
});

test("all failed role searches surface a retryable failure rather than empty results", async () => {
  await assert.rejects(
    fetchInternshipPages([{ query: "Data Analyst" }], async () => {
      throw new Error("provider unavailable");
    }),
    /temporarily unavailable/
  );
});

test("all-failed searches preserve safe provider status and message for retry handling", async () => {
  const providerError = Object.assign(new Error("Request failed"), {
    response: { status: 429, data: { message: "JSearch rate limit reached." } }
  });
  await assert.rejects(
    fetchInternshipPages([{ query: "Data Analyst" }], async () => {
      throw providerError;
    }),
    (error) => error.response.status === 429 && /rate limit/i.test(error.message)
  );
});

test("Load more advances cursors, avoids duplicate listings, and keeps failed pages retryable", async () => {
  const requests = [
    { query: "AI Engineering", cursor: "ai-page-2" },
    { query: "Full-Stack Development", cursor: "full-stack-page-2" }
  ];
  const result = await fetchNextInternshipPages(requests, async ({ query }) => {
    if (query === "Full-Stack Development") throw new Error("temporary provider failure");
    return {
      internships: [{ _id: "ai-page-2" }, { _id: "duplicate" }],
      nextCursor: "ai-page-3"
    };
  });

  assert.deepEqual(result.internships.map((listing) => listing._id), ["ai-page-2", "duplicate"]);
  assert.equal(result.failedSearches, 1);
  assert.deepEqual(result.nextSearches, [
    { query: "AI Engineering", cursor: "ai-page-3" },
    requests[1]
  ]);
});
