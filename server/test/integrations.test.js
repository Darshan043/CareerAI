import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { textToPdf } from "../src/utils/pdf.js";
import { dedupeInternships, mapApplicationLink } from "../src/utils/internshipLinks.js";

process.env.JWT_SECRET ||= "careerpilot-integration-test-secret-0123456789";

const [{ app }, repository, { env }, { dbState }, { Internship }, { normalizeJSearchJob, searchJSearchJobs, clearJSearchState }, { normalizeHimalayasJob, searchHimalayasJobs, clearHimalayasCache }, { searchJobListings }, { generateGeminiJson }, { scoreInternship }] =
  await Promise.all([
    import("../src/app.js"),
    import("../src/services/repository.js"),
    import("../src/config/env.js"),
    import("../src/config/db.js"),
    import("../src/models/Internship.js"),
    import("../src/services/jsearchService.js"),
    import("../src/services/himalayasService.js"),
    import("../src/services/jobSearchService.js"),
    import("../src/services/geminiService.js"),
    import("../src/agents/matchingAgent.js")
  ]);
const { normalizeRemotive } = await import("../src/agents/discoveryAgent.js");
const { generateResumeVariant } = await import("../src/agents/applicationPreparationAgent.js");

const nativeFetch = globalThis.fetch;
let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("Himalayas sends search filters and normalizes current India internships", async () => {
  clearHimalayasCache();
  const previousKey = env.himalayasApiKey;
  env.himalayasApiKey = "test-himalayas-key";
  let requestedUrl;
  let authHeader = "";
  try {
    const result = await searchHimalayasJobs({
      query: "frontend intern",
      location: "Bengaluru",
      employmentType: "INTERN",
      postedDate: "week"
    }, {
      fetchImpl: async (url, options) => {
        requestedUrl = new URL(url);
        authHeader = options.headers?.["Authorization"] || "";
        return new Response(JSON.stringify({
          totalCount: 1,
          jobs: [
            {
              guid: "test-himalayas-job",
              title: "Frontend Developer Intern",
              companyName: "Example Company",
              companySlug: "example-company",
              companyLogo: "https://cdn.example.test/logo.png",
              description: "Build React and JavaScript applications.",
              categories: ["React", "JavaScript", "Intern"],
              employmentType: "Intern",
              locationRestrictions: ["India"],
              applicationLink: "https://himalayas.app/companies/example-company/jobs/frontend-developer-intern",
              pubDate: Math.floor(Date.now() / 1000) - 3600,
              minSalary: 1000,
              maxSalary: 2000,
              currency: "USD",
              salaryPeriod: "monthly"
            },
            {
              guid: "us-only-job",
              title: "US Only Intern",
              companyName: "US Company",
              description: "US based.",
              employmentType: "Intern",
              locationRestrictions: ["United States"],
              applicationLink: "https://himalayas.app/companies/us-company/jobs/us-only-intern",
              pubDate: Math.floor(Date.now() / 1000) - 3600
            }
          ]
        }), { status: 200 });
      }
    });

    assert.equal(requestedUrl.pathname, "/jobs/api/search");
    assert.equal(requestedUrl.searchParams.get("country"), "India");
    assert.match(requestedUrl.searchParams.get("q"), /frontend intern/i);
    assert.equal(authHeader, "Bearer test-himalayas-key");
    assert.equal(result.internships.length, 1);
    assert.equal(result.internships[0].source, "Himalayas");
    assert.equal(result.internships[0].isSample, false);
    assert.equal(result.internships[0].employmentType, "INTERN");
    assert.equal(result.internships[0].applyLink, "https://himalayas.app/companies/example-company/jobs/frontend-developer-intern");
    assert.equal(result.internships[0].applicationLinkType, "platform");
    assert.equal(result.internships[0].salary, "USD 1000 - 2000 / monthly");
  } finally {
    env.himalayasApiKey = previousKey;
    clearHimalayasCache();
  }
});

test("Himalayas enforces the requested employment type when provider results disagree", async () => {
  clearHimalayasCache();
  try {
    const result = await searchHimalayasJobs({
      query: "software engineer",
      location: "India",
      employmentType: "INTERN",
      postedDate: "week"
    }, {
      fetchImpl: async () => new Response(JSON.stringify({
        totalCount: 2,
        jobs: [
          {
            guid: "fulltime-job",
            title: "Senior Software Engineer",
            companyName: "Example Co",
            companySlug: "example-co",
            employmentType: "Full Time",
            locationRestrictions: [],
            applicationLink: "https://himalayas.app/companies/example-co/jobs/senior-software-engineer",
            pubDate: Math.floor(Date.now() / 1000) - 3600
          },
          {
            guid: "intern-job",
            title: "Software Engineering Intern",
            companyName: "Example Co",
            companySlug: "example-co",
            employmentType: "Intern",
            locationRestrictions: [],
            applicationLink: "https://himalayas.app/companies/example-co/jobs/software-engineering-intern",
            pubDate: Math.floor(Date.now() / 1000) - 3600
          }
        ]
      }), { status: 200 })
    });

    assert.deepEqual(result.internships.map((job) => job.externalId), ["intern-job"]);
    assert.equal(result.internships[0].employmentType, "INTERN");
  } finally {
    clearHimalayasCache();
  }
});

test("Himalayas continuation uses offset and returns next page cursor", async () => {
  clearHimalayasCache();
  let requestedUrl;
  try {
    const result = await searchHimalayasJobs({
      query: "AI Engineering",
      cursor: "20",
      postedDate: "month"
    }, {
      fetchImpl: async (url) => {
        requestedUrl = new URL(url);
        return new Response(JSON.stringify({
          totalCount: 45,
          jobs: [{
            guid: "page-2-job",
            title: "AI Engineer Intern",
            companyName: "AI Co",
            companySlug: "ai-co",
            employmentType: "Intern",
            locationRestrictions: ["India"],
            applicationLink: "https://himalayas.app/companies/ai-co/jobs/ai-engineer-intern",
            pubDate: Math.floor(Date.now() / 1000) - 3600
          }]
        }), { status: 200 });
      }
    });
    assert.equal(requestedUrl.searchParams.get("offset"), "20");
    assert.equal(result.internships.length, 1);
    assert.equal(result.nextCursor, "21");
  } finally {
    clearHimalayasCache();
  }
});

test("Himalayas in-memory caching serves repeated queries without refetching", async () => {
  clearHimalayasCache();
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    return new Response(JSON.stringify({
      totalCount: 1,
      jobs: [{
        guid: "cached-job",
        title: "Cached Developer Intern",
        companyName: "Cache Co",
        companySlug: "cache-co",
        employmentType: "Intern",
        locationRestrictions: [],
        applicationLink: "https://himalayas.app/companies/cache-co/jobs/cached-developer-intern",
        pubDate: Math.floor(Date.now() / 1000) - 1800
      }]
    }), { status: 200 });
  };

  const res1 = await searchHimalayasJobs({ query: "caching test", location: "India", employmentType: "INTERN", postedDate: "week" }, { fetchImpl: mockFetch });
  const res2 = await searchHimalayasJobs({ query: "caching test", location: "India", employmentType: "INTERN", postedDate: "week" }, { fetchImpl: mockFetch });

  assert.equal(callCount, 1);
  assert.equal(res1.internships[0].title, "Cached Developer Intern");
  assert.equal(res2.internships[0].title, "Cached Developer Intern");
  clearHimalayasCache();
});

test("Himalayas rate limits and server errors return safe actionable errors", async () => {
  clearHimalayasCache();
  await assert.rejects(
    searchHimalayasJobs({ query: "data intern" }, {
      fetchImpl: async () => new Response("Too Many Requests", { status: 429 })
    }),
    (error) => error.status === 429 && /rate limit/i.test(error.message)
  );

  await assert.rejects(
    searchHimalayasJobs({ query: "data intern" }, {
      fetchImpl: async () => new Response("Unauthorized", { status: 401 })
    }),
    (error) => error.status === 503 && /configuration/i.test(error.message)
  );
  clearHimalayasCache();
});

test("JSearch link mapping rejects generic searches, labels specific board pages, and prefers verified direct options", () => {
  const searchPage = mapApplicationLink({
    job_apply_link: "https://www.linkedin.com/jobs/search/?keywords=frontend%20intern&location=India",
    job_apply_is_direct: false
  });
  assert.equal(searchPage, null);

  const specificBoardPage = mapApplicationLink({
    job_apply_link: "https://www.linkedin.com/jobs/view/frontend-intern-at-example-1234567890/",
    job_apply_is_direct: false
  });
  assert.deepEqual(specificBoardPage, {
    applyLink: "https://www.linkedin.com/jobs/view/frontend-intern-at-example-1234567890/",
    applicationLinkType: "platform"
  });

  const directOption = mapApplicationLink({
    job_apply_link: "https://www.linkedin.com/jobs/view/frontend-intern-at-example-1234567890/",
    job_apply_is_direct: false,
    apply_options: [
      { publisher: "LinkedIn", apply_link: "https://www.linkedin.com/jobs/view/frontend-intern-at-example-1234567890/", is_direct: false },
      { publisher: "Employer", apply_link: "https://careers.example.test/jobs/req-77821/apply", is_direct: true }
    ]
  });
  assert.deepEqual(directOption, {
    applyLink: "https://careers.example.test/jobs/req-77821/apply",
    applicationLinkType: "direct"
  });

  assert.deepEqual(mapApplicationLink({
    job_apply_link: "https://careers.example.test/apply",
    job_apply_is_direct: true
  }), {
    applyLink: "https://careers.example.test/apply",
    applicationLinkType: "direct"
  });

  const badDirectFlag = mapApplicationLink({
    job_apply_link: "https://www.linkedin.com/jobs/search/?keywords=frontend",
    job_apply_is_direct: true
  });
  assert.equal(badDirectFlag, null);

  const duplicates = dedupeInternships([
    { externalId: "board-copy", source: "JSearch", company: "Example Co", title: "Frontend Intern", location: "Pune, India", applicationLinkType: "platform", postedDate: new Date("2026-10-22") },
    { externalId: "employer-copy", source: "JSearch", company: "Example Co", title: "Frontend Intern", location: "Pune, India", applicationLinkType: "direct", postedDate: new Date("2026-10-21") }
  ]);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].applicationLinkType, "direct");
});

test("Remotive discovery keeps only current India-eligible internship detail pages", () => {
  const recent = new Date().toISOString();
  const base = {
    id: 789,
    title: "Frontend Developer Intern",
    company_name: "Example Remote Co",
    job_type: "internship",
    candidate_required_location: "India or Worldwide",
    publication_date: recent,
    url: "https://remotive.com/remote-jobs/software-dev/frontend-developer-intern-789",
    description: "Build React applications."
  };
  const accepted = normalizeRemotive(base);
  assert.equal(accepted.source, "Remotive");
  assert.equal(accepted.country, "India");
  assert.equal(accepted.applicationLinkType, "platform");

  assert.equal(normalizeRemotive({ ...base, candidate_required_location: "Europe only" }), null);
  assert.equal(normalizeRemotive({ ...base, title: "Frontend Developer", job_type: "full_time" }), null);
  assert.equal(normalizeRemotive({ ...base, publication_date: "2026-01-01T00:00:00Z" }), null);
  assert.equal(normalizeRemotive({ ...base, url: "https://remotive.com/api/remote-jobs" }), null);
});

test("JSearch rate limits and missing configuration return safe actionable errors", async () => {
  const previousKey = env.jsearchApiKey;
  try {
    env.jsearchApiKey = "test-only-key";
    await assert.rejects(
      searchJSearchJobs({ query: "data intern" }, {
        fetchImpl: async () => new Response("provider details are not forwarded", { status: 429 })
      }),
      (error) => error.status === 429 && /rate limit/i.test(error.message)
    );
    env.jsearchApiKey = "";
    await assert.rejects(
      searchJSearchJobs({ query: "data intern" }, {
        fetchImpl: async () => {
          throw new Error("This should not be called.");
        }
      }),
      (error) => error.status === 503 && /not configured/i.test(error.message)
    );
  } finally {
    env.jsearchApiKey = previousKey;
    clearJSearchState();
  }
});

function makeJSearchJob(overrides = {}) {
  return {
    job_id: "city-intern-1",
    job_title: "Software Engineer Intern",
    employer_name: "Example India",
    job_description: "Build software with JavaScript.",
    job_city: "Chennai",
    job_state: "Tamil Nadu",
    job_country: "India",
    job_employment_type: "INTERN",
    job_is_remote: false,
    job_posted_at_datetime_utc: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    job_apply_link: "https://jobs.example.test/roles/software-engineer-intern",
    job_apply_is_direct: true,
    ...overrides
  };
}

test("JSearch applies India, city, employment, and posting-date filters before returning exact and separated locations", async () => {
  clearJSearchState();
  const previousKey = env.jsearchApiKey;
  env.jsearchApiKey = "test-only-key";
  let requestedUrl;
  try {
    const result = await searchJSearchJobs({
      query: "Software Engineer",
      location: "Chennai",
      employmentType: "INTERN",
      postedDate: "week"
    }, {
      fetchImpl: async (url) => {
        requestedUrl = new URL(url);
        return new Response(JSON.stringify({
          data: [
            makeJSearchJob(),
            makeJSearchJob({
              job_id: "remote-intern",
              job_title: "Remote Data Intern",
              job_city: "",
              job_state: "",
              job_is_remote: true,
              job_location: "Remote, India",
              job_apply_link: "https://jobs.example.test/roles/remote-data-intern"
            }),
            makeJSearchJob({
              job_id: "other-indian-city",
              job_city: "Coimbatore",
              job_apply_link: "https://jobs.example.test/roles/coimbatore-intern"
            }),
            makeJSearchJob({
              job_id: "outside-india",
              job_country: "United States",
              job_city: "Boston",
              job_apply_link: "https://jobs.example.test/roles/boston-intern"
            }),
            makeJSearchJob({
              job_id: "old-intern",
              job_posted_at_datetime_utc: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
              job_apply_link: "https://jobs.example.test/roles/old-intern"
            })
          ]
        }), { status: 200 });
      }
    });
    assert.equal(requestedUrl.searchParams.get("country"), "in");
    assert.match(requestedUrl.searchParams.get("query"), /Software Engineer internship in Chennai/i);
    assert.equal(requestedUrl.searchParams.get("employment_types"), "INTERN");
    assert.equal(requestedUrl.searchParams.get("date_posted"), "week");
    assert.deepEqual(result.internships.map((job) => job.externalId), ["city-intern-1", "remote-intern", "other-indian-city"]);
    assert.equal(result.internships[0].applyLink, "https://jobs.example.test/roles/software-engineer-intern");
  } finally {
    env.jsearchApiKey = previousKey;
    clearJSearchState();
  }
});

test("JSearch caches repeated filters and honors date filters for non-internship job titles", async () => {
  clearJSearchState();
  const previousKey = env.jsearchApiKey;
  env.jsearchApiKey = "test-only-key";
  let callCount = 0;
  try {
    const fetchImpl = async (url) => {
      callCount++;
      const requestUrl = new URL(url);
      assert.equal(requestUrl.searchParams.get("country"), "in");
      assert.equal(requestUrl.searchParams.get("employment_types"), "FULLTIME");
      assert.equal(requestUrl.searchParams.get("date_posted"), "month");
      return new Response(JSON.stringify({
        data: [makeJSearchJob({
          job_id: "fulltime-india",
          job_title: "Data Analyst",
          job_employment_type: "FULLTIME",
          job_apply_link: "https://jobs.example.test/roles/data-analyst"
        })]
      }), { status: 200 });
    };
    const filters = { query: "Data Analyst", location: "India", employmentType: "FULLTIME", postedDate: "month" };
    const first = await searchJSearchJobs(filters, { fetchImpl });
    const repeated = await searchJSearchJobs(filters, { fetchImpl });
    assert.equal(callCount, 1);
    assert.equal(first.internships[0].title, "Data Analyst");
    assert.equal(repeated.internships[0].employmentType, "FULLTIME");
  } finally {
    env.jsearchApiKey = previousKey;
    clearJSearchState();
  }
});

test("JSearch sends each documented posting-date filter", async () => {
  clearJSearchState();
  const previousKey = env.jsearchApiKey;
  env.jsearchApiKey = "test-only-key";
  const requestedDates = [];
  try {
    for (const postedDate of ["today", "3days", "week", "month", "all"]) {
      await searchJSearchJobs({ query: "Data Analyst", postedDate }, {
        fetchImpl: async (url) => {
          const requestUrl = new URL(url);
          requestedDates.push(requestUrl.searchParams.get("date_posted"));
          assert.equal(requestUrl.searchParams.get("page"), "1");
          assert.equal(requestUrl.searchParams.get("country"), "in");
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
      });
    }
    assert.deepEqual(requestedDates, ["today", "3days", "week", "month", "all"]);
  } finally {
    env.jsearchApiKey = previousKey;
    clearJSearchState();
  }
});

test("monthly JSearch quota is not retried while exhausted and resumes after the provider reset", async () => {
  clearJSearchState();
  clearHimalayasCache();
  const previousKey = env.jsearchApiKey;
  env.jsearchApiKey = "test-only-key";
  let jsearchCalls = 0;
  let himalayasCalls = 0;
  try {
    const fetchImpl = async (input) => {
      if (String(input).startsWith("https://jsearch.p.rapidapi.com/")) {
        jsearchCalls++;
        return new Response("You have exceeded the MONTHLY quota for Requests.", {
          status: 429,
          headers: { "x-ratelimit-requests-reset": String((Date.now() + 300) / 1000) }
        });
      }
      himalayasCalls++;
      return new Response(JSON.stringify({
        totalCount: 1,
        jobs: [{
          guid: "quota-fallback",
          title: "Frontend Developer Intern",
          companyName: "Fallback India",
          employmentType: "Intern",
          locationRestrictions: ["India"],
          applicationLink: "https://himalayas.app/companies/fallback-india/jobs/frontend-developer-intern",
          pubDate: Math.floor(Date.now() / 1000) - 3600
        }]
      }), { status: 200 });
    };
    const filters = { query: "Frontend Developer", location: "Chennai", employmentType: "INTERN", postedDate: "week" };
    const first = await searchJobListings(filters, { fetchImpl });
    const second = await searchJobListings(filters, { fetchImpl });
    assert.equal(first.providerStatus, "himalayas-fallback");
    assert.equal(first.internships[0].source, "Himalayas");
    assert.equal(first.internships[0].locationMatch, "remote");
    assert.equal(second.providerStatus, "himalayas-fallback");
    assert.equal(jsearchCalls, 1);
    assert.equal(himalayasCalls, 1);

    clearHimalayasCache();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const resumed = await searchJSearchJobs(filters, {
      fetchImpl: async () => {
        jsearchCalls++;
        return new Response(JSON.stringify({ data: [makeJSearchJob()] }), { status: 200 });
      }
    });
    assert.equal(resumed.internships.length, 1);
    assert.equal(jsearchCalls, 2);
  } finally {
    env.jsearchApiKey = previousKey;
    clearJSearchState();
    clearHimalayasCache();
  }
});

test("temporary JSearch failures fall back to Himalayas without exposing provider errors", async () => {
  clearJSearchState();
  clearHimalayasCache();
  const previousKey = env.jsearchApiKey;
  env.jsearchApiKey = "test-only-key";
  try {
    const result = await searchJobListings({
      query: "Data Analyst",
      location: "Coimbatore",
      employmentType: "INTERN",
      postedDate: "week"
    }, {
      fetchImpl: async (input) => {
        if (String(input).startsWith("https://jsearch.p.rapidapi.com/")) {
          throw new Error("provider response contained internal details");
        }
        return new Response(JSON.stringify({
          totalCount: 1,
          jobs: [{
            guid: "temporary-outage-fallback",
            title: "Data Analyst Intern",
            companyName: "Fallback Company",
            employmentType: "Intern",
            locationRestrictions: ["India"],
            applicationLink: "https://himalayas.app/companies/fallback-company/jobs/data-analyst-intern",
            pubDate: Math.floor(Date.now() / 1000) - 3600
          }]
        }), { status: 200 });
      }
    });
    assert.equal(result.providerStatus, "himalayas-fallback");
    assert.equal(result.internships.length, 1);
    assert.equal(result.internships[0].source, "Himalayas");
    assert.equal(JSON.stringify(result).includes("provider response contained internal details"), false);
  } finally {
    env.jsearchApiKey = previousKey;
    clearJSearchState();
    clearHimalayasCache();
  }
});

test("combined search deduplicates provider copies, prefers direct links, and marks exact, remote, and India-wide results", async () => {
  clearJSearchState();
  clearHimalayasCache();
  const previousKey = env.jsearchApiKey;
  env.jsearchApiKey = "test-only-key";
  try {
    const result = await searchJobListings({
      query: "Software Engineer",
      location: "Chennai",
      employmentType: "INTERN",
      postedDate: "week"
    }, {
      fetchImpl: async (input) => {
        if (String(input).startsWith("https://jsearch.p.rapidapi.com/")) {
          return new Response(JSON.stringify({
            data: [
              makeJSearchJob(),
              makeJSearchJob({
                job_id: "remote-copy",
                job_title: "Remote Design Intern",
                job_city: "",
                job_state: "",
                job_is_remote: true,
                job_location: "Remote, India",
                job_apply_link: "https://jobs.example.test/roles/remote-design-intern"
              }),
              makeJSearchJob({
                job_id: "broad-india",
                job_city: "Vellore",
                job_apply_link: "https://jobs.example.test/roles/vellore-intern"
              })
            ]
          }), { status: 200 });
        }
        return new Response(JSON.stringify({
          totalCount: 1,
          jobs: [
            {
              guid: "same-as-jsearch",
              title: "Software Engineer Intern",
              companyName: "Example India",
              employmentType: "Intern",
              location: "Chennai, Tamil Nadu, India",
              locationRestrictions: ["India"],
              applicationLink: "https://himalayas.app/companies/example-india/jobs/software-engineer-intern",
              pubDate: Math.floor(Date.now() / 1000) - 3600
            },
            {
              guid: "himalayas-unique",
              title: "Backend Developer Intern",
              companyName: "Himalayas Example",
              employmentType: "Intern",
              locationRestrictions: ["India"],
              applicationLink: "https://himalayas.app/companies/himalayas-example/jobs/backend-developer-intern",
              pubDate: Math.floor(Date.now() / 1000) - 3600
            }
          ]
        }), { status: 200 });
      }
    });
    assert.equal(result.providerStatus, "combined");
    assert.equal(result.internships.length, 4);
    assert.equal(result.internships[0].locationMatch, "exact");
    assert.equal(result.internships[0].source, "JSearch");
    assert.equal(result.internships[0].applyLink, "https://jobs.example.test/roles/software-engineer-intern");
    assert.ok(result.internships.some((job) => job.source === "Himalayas" && job.externalId === "himalayas-unique"));
    assert.deepEqual(result.internships.map((job) => job.locationMatch).sort(), ["exact", "india", "remote", "remote"]);
  } finally {
    env.jsearchApiKey = previousKey;
    clearJSearchState();
    clearHimalayasCache();
  }
});

test("Gemini sends API credentials only in request headers and parses JSON responses", async () => {
  const previousKey = env.geminiApiKey;
  const previousModel = env.geminiModel;
  env.geminiApiKey = "test-only-key";
  env.geminiModel = "gemini-3.6-flash";
  try {
    const result = await generateGeminiJson("Return a JSON object.", {
      fetchImpl: async (url, options) => {
        assert.match(url, /models\/gemini-3\.6-flash:generateContent$/);
        assert.equal(new URL(url).search, "");
        assert.equal(typeof options.headers["x-goog-api-key"], "string");
        assert.ok(options.headers["x-goog-api-key"].length > 0);
        const body = JSON.parse(options.body);
        assert.equal(body.generationConfig.responseMimeType, "application/json");
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ text: "{\"verified\":true}" }] } }]
        }), { status: 200 });
      }
    });
    assert.deepEqual(result, { verified: true });
  } finally {
    env.geminiApiKey = previousKey;
    env.geminiModel = previousModel;
  }
});

test("Gemini reports safe configuration, credential, quota, timeout, and upstream errors", async () => {
  const previousKey = env.geminiApiKey;
  env.geminiApiKey = "gemini-test-secret";
  const expectGeminiError = async (fetchImpl, status, messagePattern) => {
    await assert.rejects(
      generateGeminiJson("Return JSON.", { fetchImpl }),
      (error) => {
        assert.equal(error.status, status);
        assert.match(error.message, messagePattern);
        assert.equal(error.message.includes("gemini-test-secret"), false);
        assert.equal(error.message.includes("provider-private-detail"), false);
        return true;
      }
    );
  };

  try {
    env.geminiApiKey = "   ";
    await expectGeminiError(async () => {
      throw new Error("Fetch must not run without a configured key.");
    }, 503, /GEMINI_API_KEY/);

    env.geminiApiKey = "gemini-test-secret";
    const providerResponse = (status, error) => async () => new Response(JSON.stringify({ error }), { status });
    await expectGeminiError(
      providerResponse(401, { message: "provider-private-detail gemini-test-secret" }),
      503,
      /rejected the configured API key/
    );
    await expectGeminiError(
      providerResponse(400, { status: "API_KEY_INVALID", message: "provider-private-detail gemini-test-secret" }),
      503,
      /rejected the configured API key/
    );
    await expectGeminiError(
      providerResponse(429, { status: "RESOURCE_EXHAUSTED", message: "provider-private-detail" }),
      429,
      /quota is exhausted/
    );
    await expectGeminiError(
      providerResponse(429, { status: "RATE_LIMIT_EXCEEDED", message: "provider-private-detail" }),
      429,
      /rate limit reached/
    );
    await expectGeminiError(
      async () => { const error = new Error("upstream timeout"); error.name = "TimeoutError"; throw error; },
      504,
      /timed out/
    );
    await expectGeminiError(
      providerResponse(404, { message: "provider-private-detail" }),
      503,
      /GEMINI_MODEL/
    );
    await expectGeminiError(
      providerResponse(503, { message: "provider-private-detail" }),
      502,
      /could not complete this request/
    );
  } finally {
    env.geminiApiKey = previousKey;
  }
});

test("application material generation requires Gemini and returns only its generated copy", async () => {
  const previousKey = env.geminiApiKey;
  const originalFetch = globalThis.fetch;
  const profile = {
    resumeText: "Skills: React, JavaScript\nProjects\nBuilt a React course planner.",
    skills: ["React", "JavaScript"],
    projects: ["Built a React course planner."],
    experience: []
  };
  const internship = { title: "Frontend Intern", company: "Example Company", skillsRequired: ["React"] };

  try {
    env.geminiApiKey = "";
    await assert.rejects(generateResumeVariant(profile, internship, "Student"), (error) => {
      assert.equal(error.status, 503);
      assert.match(error.message, /GEMINI_API_KEY/);
      return true;
    });

    env.geminiApiKey = "test-only-key";
    globalThis.fetch = async (input, options) => {
      assert.match(String(input), /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.6-flash:generateContent$/);
      assert.equal(options.headers["x-goog-api-key"], "test-only-key");
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          coverLetter: "Gemini generated cover letter.",
          resumeBulletSuggestions: ["Built a React course planner."],
          applicationAnswers: [{ question: "Why this role?", answer: "Gemini generated answer." }]
        }) }] } }]
      }), { status: 200 });
    };

    const generated = await generateResumeVariant(profile, internship, "Student");
    assert.equal(generated.aiProvider, "Gemini");
    assert.equal(generated.aiGenerated, true);
    assert.equal(generated.coverLetter, "Gemini generated cover letter.");
    assert.deepEqual(generated.applicationAnswers, [{ question: "Why this role?", answer: "Gemini generated answer." }]);
  } finally {
    env.geminiApiKey = previousKey;
    globalThis.fetch = originalFetch;
  }
});

test("Mongo internship upsert recovers a concurrent duplicate-key insert by its unique filter", async () => {
  const originalMode = dbState.mode;
  const originalFindOneAndUpdate = Internship.findOneAndUpdate;
  const originalFindOne = Internship.findOne;
  const filter = {
    company: "Concurrent Import Test",
    title: "Platform Intern",
    applyLink: "https://example.invalid/jobs/platform-intern"
  };
  const winner = { _id: "winner-id", ...filter, source: "JSearch" };
  let lookupFilter;

  dbState.mode = "mongo";
  Internship.findOneAndUpdate = () => ({
    lean: () => ({
      exec: async () => {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }
    })
  });
  Internship.findOne = (query) => {
    lookupFilter = query;
    return { lean: () => ({ exec: async () => winner }) };
  };

  try {
    const saved = await repository.upsert("internships", filter, { ...winner, externalId: "provider-id" }, winner);
    assert.deepEqual(lookupFilter, filter);
    assert.deepEqual(saved, winner);
  } finally {
    dbState.mode = originalMode;
    Internship.findOneAndUpdate = originalFindOneAndUpdate;
    Internship.findOne = originalFindOne;
  }
});

test("resume analysis returns structured Gemini strengths and gaps from extracted text", async () => {
  const previousKey = env.geminiApiKey;
  const originalFetch = globalThis.fetch;
  env.geminiApiKey = "test-only-key";
  try {
    globalThis.fetch = async (input, options) => {
      if (String(input).startsWith("https://generativelanguage.googleapis.com/")) {
        return new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  summary: "Student with frontend project experience.",
                  strengths: ["React project experience is present."],
                  weaknesses: ["Add measurable outcomes."]
                })
              }]
            }
          }]
        }), { status: 200 });
      }
      return nativeFetch(input, options);
    };
    const { analyzeResumeText } = await import("../src/agents/profileAgent.js");
    const result = await analyzeResumeText(
      "React and JavaScript developer. Projects: built an accessible React application.",
      ["react", "javascript"],
      ["frontend"]
    );
    assert.equal(result.aiProvider, "Gemini");
    assert.equal(result.aiGenerated, true);
    assert.deepEqual(result.strengths, ["React project experience is present."]);
    assert.deepEqual(result.missingSkills, ["html", "css"]);
  } finally {
    globalThis.fetch = originalFetch;
    env.geminiApiKey = previousKey;
  }
});

test("authenticated upload extracts text from a valid PDF without changing the upload checks", async () => {
  const email = `resume-${randomUUID()}@example.invalid`;
  const previousKey = env.geminiApiKey;
  const originalFetch = globalThis.fetch;
  let userId;
  env.geminiApiKey = "test-only-key";
  globalThis.fetch = async (input, options) => {
    if (String(input).startsWith("https://generativelanguage.googleapis.com/")) {
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                summary: "A student with frontend project experience.",
                strengths: ["Project details are present."],
                weaknesses: ["Add measurable outcomes."]
              })
            }]
          }
        }]
      }), { status: 200 });
    }
    return nativeFetch(input, options);
  };

  try {
    const registration = await nativeFetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Resume Integration Test",
        email,
        password: "StrongIntegrationPass123"
      })
    });
    assert.equal(registration.status, 201);
    const account = await registration.json();
    userId = account.user._id;

    const form = new FormData();
    form.append(
      "resume",
      new Blob([textToPdf("Education\nComputer Science\nProjects\nReact application using JavaScript")], {
        type: "application/pdf"
      }),
      "resume.pdf"
    );
    const response = await nativeFetch(`${baseUrl}/api/profile/upload-resume`, {
      method: "POST",
      headers: { authorization: `Bearer ${account.token}` },
      body: form
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.match(result.profile.resumeText, /Computer Science/);
    assert.ok(result.profile.skills.includes("react"));
    assert.equal(result.profile.analysis.aiProvider, "Gemini");
    assert.equal((await repository.getOne("profiles", { userId })).resumeText, result.profile.resumeText);
  } finally {
    globalThis.fetch = originalFetch;
    env.geminiApiKey = previousKey;
    if (userId) {
      await repository.deleteWhere("resumeHistory", { userId });
      await repository.deleteWhere("profiles", { userId });
      await repository.deleteById("users", userId);
    }
  }
});

test("matching scores explain skills, role, and location without implying hiring probability", async () => {
  const result = await scoreInternship({
    skills: ["JavaScript", "React"],
    preferences: { roles: ["frontend"], location: "Bengaluru" }
  }, {
    title: "Frontend Developer Intern",
    description: "Build web interfaces",
    location: "Bengaluru, India",
    skillsRequired: ["JavaScript", "React", "Node.js"]
  });
  assert.equal(result.score, 73);
  assert.deepEqual(result.scoreBreakdown, { skills: 53, role: 10, location: 10 });
  assert.deepEqual(result.missingSkills, ["node.js"]);
});

test("authenticated Himalayas results are persisted, matched, and kept in the owner's tracker", async () => {
  const userSuffix = randomUUID();
  const testUsers = [];
  const testExternalIds = [];
  const previousKey = env.jsearchApiKey;
  const originalFetch = globalThis.fetch;
  env.jsearchApiKey = "test-only-key";
  try {
    const accountResponse = await nativeFetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Integration Test",
        email: `integration-${userSuffix}@example.invalid`,
        password: "StrongIntegrationPass123"
      })
    });
    assert.equal(accountResponse.status, 201);
    const account = await accountResponse.json();
    testUsers.push(account.user._id);
    const otherResponse = await nativeFetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Other Integration Test",
        email: `integration-other-${userSuffix}@example.invalid`,
        password: "StrongIntegrationPass123"
      })
    });
    assert.equal(otherResponse.status, 201);
    const other = await otherResponse.json();
    testUsers.push(other.user._id);

    const profile = await repository.getOne("profiles", { userId: account.user._id });
    await repository.updateById("profiles", profile._id, {
      resumeText: "Experience with JavaScript and React",
      skills: ["JavaScript", "React"],
      preferences: { roles: ["frontend"], location: "Bengaluru" }
    });

    const externalId = `integration-${userSuffix}`;
    let receivedCursor = "";
    globalThis.fetch = async (input, options) => {
      if (String(input).startsWith("https://himalayas.app/jobs/api/search")) {
        receivedCursor = new URL(input).searchParams.get("offset") || "";
        const providerId = `${externalId}-${receivedCursor || "first"}`;
        testExternalIds.push(providerId);
        return new Response(JSON.stringify({
          totalCount: 2,
          jobs: [{
            guid: providerId,
            title: "Frontend Developer Intern",
            companyName: "Integration Test Company",
            companySlug: "integration-test-company",
            description: "React and JavaScript internship.",
            categories: ["JavaScript", "React", "Node.js", "Intern"],
            employmentType: "Intern",
            city: "Bengaluru",
            locationRestrictions: ["India"],
            applicationLink: "https://himalayas.app/companies/integration-test-company/jobs/frontend-developer-intern",
            pubDate: Math.floor(Date.now() / 1000) - 3600
          }]
        }), { status: 200 });
      }
      return nativeFetch(input, options);
    };

    const headers = { authorization: `Bearer ${account.token}` };
    const searchResponse = await nativeFetch(
      `${baseUrl}/api/internships/search?query=frontend%20intern&location=Bengaluru&employmentType=INTERN&postedDate=week`,
      { headers }
    );
    assert.equal(searchResponse.status, 200);
    const search = await searchResponse.json();
    assert.equal(search.count, 1);
    assert.equal(search.nextCursor, "1");
    const internship = search.internships[0];
    assert.equal(internship.isSample, false);
    assert.equal(internship.match.score, 73);
    assert.equal(internship.applicationLinkType, "platform");
    assert.deepEqual(internship.match.missingSkills, ["node.js"]);
    assert.equal(receivedCursor, "");
    const nextPageResponse = await nativeFetch(
      `${baseUrl}/api/internships/search?query=frontend%20intern&location=Bengaluru&employmentType=INTERN&postedDate=week&cursor=${encodeURIComponent(search.nextCursor)}`,
      { headers }
    );
    assert.equal(nextPageResponse.status, 200);
    assert.equal(receivedCursor, "1");
    assert.equal((await nextPageResponse.json()).count, 1);
    const uniqueInternships = await repository.getAll("internships", {
      company: "Integration Test Company",
      title: "Frontend Developer Intern",
      applyLink: "https://himalayas.app/companies/integration-test-company/jobs/frontend-developer-intern"
    });
    assert.equal(uniqueInternships.length, 1);
    const listingResponse = await nativeFetch(`${baseUrl}/api/internships`, { headers });
    assert.equal(listingResponse.status, 200);
    const visibleListings = (await listingResponse.json()).internships;
    assert.ok(visibleListings.some((item) => String(item._id) === String(internship._id)));
    assert.ok(visibleListings.every((item) => !item.isSample && item.applyLink));
    assert.ok(await repository.getOne("matches", {
      userId: account.user._id,
      internshipId: internship._id
    }));

    const unconfirmedApplied = await nativeFetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ internshipId: internship._id, status: "APPLIED" })
    });
    assert.equal(unconfirmedApplied.status, 400);

    const saveResponse = await nativeFetch(`${baseUrl}/api/applications`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ internshipId: internship._id, status: "SAVED" })
    });
    assert.equal(saveResponse.status, 201);
    const saved = (await saveResponse.json()).application;

    const otherApplications = await nativeFetch(`${baseUrl}/api/applications`, {
      headers: { authorization: `Bearer ${other.token}` }
    });
    assert.equal(otherApplications.status, 200);
    assert.equal((await otherApplications.json()).applications.length, 0);

    const appliedResponse = await nativeFetch(`${baseUrl}/api/applications/${saved._id}`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ status: "APPLIED", confirmedSubmitted: true })
    });
    assert.equal(appliedResponse.status, 200);
    assert.equal((await appliedResponse.json()).application.status, "APPLIED");
    const persistedApplications = await (await nativeFetch(`${baseUrl}/api/applications`, { headers })).json();
    assert.equal(persistedApplications.applications[0].status, "APPLIED");
  } finally {
    globalThis.fetch = originalFetch;
    env.jsearchApiKey = previousKey;
    for (const userId of testUsers) {
      await repository.deleteWhere("applications", { userId });
      await repository.deleteWhere("matches", { userId });
      await repository.deleteWhere("notifications", { userId });
      await repository.deleteWhere("profiles", { userId });
      await repository.deleteById("users", userId);
    }
    for (const externalId of testExternalIds) {
      await repository.deleteWhere("internships", { source: "Himalayas", externalId });
      await repository.deleteWhere("internships", { source: "JSearch", externalId });
    }
  }
});
