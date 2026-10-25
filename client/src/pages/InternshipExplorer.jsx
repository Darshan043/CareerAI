import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkPlus,
  ExternalLink,
  FileText,
  Search
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { applicationApi, internshipApi, profileApi } from "../api/queries";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { inputClass } from "../components/Field";
import { LoadingState } from "../components/LoadingState";
import { formatDate } from "../utils/format";
import {
  fetchInternshipPages,
  getRecommendationRoles
} from "../utils/internshipSearch";

function workModeFromLocation(location = "") {
  const value = location.toLowerCase();
  if (value.includes("remote")) return "Remote";
  if (value.includes("hybrid")) return "Hybrid";
  if (value) return "On-site";
  return "Unspecified";
}

export function InternshipExplorer() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialRoleQuery = searchParams.get("q") || "";
  const [roleQuery, setRoleQuery] = useState(initialRoleQuery);
  const [locationQuery, setLocationQuery] = useState("");
  const [employmentType, setEmploymentType] = useState("INTERN");
  const [postedDate, setPostedDate] = useState("week");
  const [submittedFilters, setSubmittedFilters] = useState(null);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: profileApi.get, retry: 1 });
  const profile = profileQuery.data?.profile;
  const defaultLocation = locationQuery.trim() || profile?.preferences?.location || profile?.location || "India";
  const recommendationRoles = useMemo(() => getRecommendationRoles(profile), [profile]);
  const activeFilters = useMemo(() => submittedFilters || ({
    role: initialRoleQuery,
    location: "",
    employmentType: "INTERN",
    postedDate: "week"
  }), [submittedFilters, initialRoleQuery]);
  const submittedRoleQuery = activeFilters.role;
  const searches = useMemo(() => {
    const roles = activeFilters.role ? [activeFilters.role] : recommendationRoles;
    return roles.map((query) => ({
      query,
      location: activeFilters.location.trim() || profile?.preferences?.location || profile?.location || "India",
      employmentType: activeFilters.employmentType,
      postedDate: activeFilters.postedDate
    }));
  }, [activeFilters, recommendationRoles, profile]);
  const searchQueryKey = ["internship-search", searches];
  const liveSearchQuery = useQuery({
    queryKey: searchQueryKey,
    queryFn: () => fetchInternshipPages(searches, internshipApi.search),
    enabled: profileQuery.isSuccess || profileQuery.isError,
    retry: (failureCount, error) =>
      failureCount < 1 && error.response?.status !== 429 && error.response?.status !== 400,
    retryDelay: 1000
  });
  const saveMutation = useMutation({
    mutationFn: (internshipId) => applicationApi.create({ internshipId, status: "SAVED" }),
    onMutate: (internshipId) => setBusyId(internshipId),
    onSettled: () => setBusyId(""),
    onSuccess: () => {
      setNotice("Saved to Tracker under Saved.");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
  });

  const internships = liveSearchQuery.data?.internships || [];
  const filtered = internships;
  const locationGroups = [
    {
      key: "exact",
      label: `Exact location matches${searches[0]?.location ? ` · ${searches[0].location}` : ""}`,
      jobs: filtered.filter((job) => job.locationMatch === "exact")
    },
    {
      key: "remote",
      label: "Remote jobs available to India",
      jobs: filtered.filter((job) => job.locationMatch === "remote")
    },
    {
      key: "india",
      label: "Other Indian locations",
      jobs: filtered.filter((job) => !["exact", "remote"].includes(job.locationMatch))
    }
  ];
  const showProfileRecommendations = () => {
    setRoleQuery("");
    setSubmittedFilters({ role: "", location: locationQuery, employmentType, postedDate });
  };
  const submitSearch = (event) => {
    event.preventDefault();
    setSubmittedFilters({ role: roleQuery.trim(), location: locationQuery, employmentType, postedDate });
  };

  if (profileQuery.isLoading || (liveSearchQuery.isLoading && !liveSearchQuery.data)) {
    return <LoadingState label="Finding internships for your profile" />;
  }

  return (
    <div className="grid gap-5">
      <ErrorBanner
        error={saveMutation.error}
      />
      {notice ? <p className="rounded-md bg-moss/10 px-3 py-2 text-sm font-bold text-moss">{notice}</p> : null}
      {profileQuery.error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/65">
          <span>Profile preferences could not be loaded. Showing general internship listings for now.</span>
          <Button variant="secondary" loading={profileQuery.isFetching} onClick={() => profileQuery.refetch()}>
            Retry profile
          </Button>
        </div>
      ) : null}
      {liveSearchQuery.error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/65">
          <span>
            {liveSearchQuery.data
              ? "Some live searches could not refresh; the listings that did load are still shown."
              : `${liveSearchQuery.error.response?.data?.message || liveSearchQuery.error.message || "Live search is temporarily unavailable."} Your profile recommendations have not been replaced with an empty result.`}
          </span>
          <Button variant="secondary" loading={liveSearchQuery.isFetching} onClick={() => liveSearchQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {!liveSearchQuery.error && liveSearchQuery.data?.failedSearches ? (
        <div className="rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/65">
          Some preferred roles could not be searched; showing the available recommendations.
          <button
            type="button"
            className="ml-2 font-black text-moss"
            onClick={() => liveSearchQuery.refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {liveSearchQuery.data?.providerStatus === "himalayas-fallback" ? (
        <div className="rounded-md border border-ink/10 bg-white px-4 py-3 text-sm font-semibold text-ink/65">
          JSearch is temporarily unavailable. Showing eligible listings from Himalayas instead.
        </div>
      ) : null}
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-ink">Jobs &amp; Internship Explorer</h2>
            <p className="text-sm font-semibold text-ink/55">
              {liveSearchQuery.isError && !liveSearchQuery.data
                ? "Live job listings are temporarily unavailable"
                : `${filtered.length} current job listings · ${submittedRoleQuery ? `for “${submittedRoleQuery}”` : "recommended for your profile"}`}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <form
            className="grid gap-3 rounded-md border border-moss/15 bg-moss/5 p-3 sm:col-span-2 sm:grid-cols-2 xl:col-span-5 xl:grid-cols-5"
            onSubmit={submitSearch}
          >
            <input
              className={inputClass}
              placeholder="Job title or role (optional)"
              aria-label="Job title or role"
              maxLength={160}
              value={roleQuery}
              onChange={(event) => setRoleQuery(event.target.value)}
            />
            <input
              className={inputClass}
              placeholder={defaultLocation}
              aria-label="Live job search location"
              maxLength={100}
              value={locationQuery}
              onChange={(event) => setLocationQuery(event.target.value)}
            />
            <select
              className={inputClass}
              aria-label="Employment type"
              value={employmentType}
              onChange={(event) => setEmploymentType(event.target.value)}
            >
              <option value="">Any employment type</option>
              <option value="INTERN">Internship</option>
              <option value="FULLTIME">Full time</option>
              <option value="PARTTIME">Part time</option>
              <option value="CONTRACTOR">Contract</option>
              <option value="TEMPORARY">Temporary</option>
            </select>
            <select
              className={inputClass}
              aria-label="Posting date"
              value={postedDate}
              onChange={(event) => setPostedDate(event.target.value)}
            >
              <option value="today">Today</option>
              <option value="3days">Past 3 days</option>
              <option value="week">Past week</option>
              <option value="month">Past month</option>
              <option value="all">Any time</option>
            </select>
            <div className="flex gap-2 sm:col-span-2 xl:col-span-2">
              <Button className="flex-1" type="submit" icon={Search} loading={liveSearchQuery.isFetching}>
                Search Jobs
              </Button>
              <Button className="flex-1" type="button" variant="secondary" onClick={showProfileRecommendations}>
                Show Profile Recommendations
              </Button>
            </div>
          </form>
          {!submittedRoleQuery ? (
            <p className="text-xs font-semibold text-ink/50 sm:col-span-2 xl:col-span-5">
              Starting with {recommendationRoles.slice(0, 3).join(", ")}. Recommendations use your uploaded resume and profile summary.
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {liveSearchQuery.isError && !liveSearchQuery.data ? (
          <div className="rounded-lg border border-dashed border-ink/15 bg-white p-8 text-sm font-semibold text-ink/60 md:col-span-2 xl:col-span-3">
            Live listings could not be loaded right now. Retry the request to try again.
          </div>
        ) : filtered.length ? (
          locationGroups.map((group) => group.jobs.length ? (
            <div key={group.key} className="contents">
              <h3 className="text-sm font-black uppercase tracking-wide text-ink/60 md:col-span-2 xl:col-span-3">
                {group.label} ({group.jobs.length})
              </h3>
              {group.jobs.map((internship) => (
            <article key={internship._id} className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-ink">{internship.title}</h3>
                  <p className="text-sm font-semibold text-ink/55">{internship.company}</p>
                  <p className="mt-1 text-xs font-bold text-ink/40">
                    {internship.source}
                    {internship.isSample ? " · sample / starter example" : " · external / discovered"}
                  </p>
                </div>
                <div className="grid h-14 w-16 place-items-center rounded-md bg-moss/10 text-xl font-black text-moss">
                  {internship.match ? `${internship.match.score}%` : "—"}
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-sm font-medium leading-6 text-ink/65">{internship.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(internship.skillsRequired || []).slice(0, 5).map((entry) => (
                  <span key={entry} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-black text-ink/65">
                    {entry}
                  </span>
                ))}
              </div>
              {internship.match ? (
                <div className="mt-3 grid gap-1 text-xs font-semibold text-ink/55">
                  <p>
                    Matching: {(internship.match.matchedSkills || []).slice(0, 4).join(", ") || "None listed"}
                  </p>
                  <p>
                    Missing: {(internship.match.missingSkills || []).slice(0, 4).join(", ") || "None listed"}
                  </p>
                  <p>
                    Heuristic fit only, not hiring probability: skills {internship.match.scoreBreakdown?.skills ?? "—"}/80,
                    role {internship.match.scoreBreakdown?.role ?? "—"}/10, location {internship.match.scoreBreakdown?.location ?? "—"}/10.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs font-semibold text-ink/45">
                  Personalized match details are unavailable for this listing.
                </p>
              )}
              <div className="mt-5 flex items-center justify-between gap-3 text-xs font-bold text-ink/50">
                <span>
                  {internship.location} · {workModeFromLocation(internship.location)}
                </span>
                <span>{internship.deadline ? `Due ${formatDate(internship.deadline)}` : "Deadline unverified"}</span>
              </div>
              {internship.employmentType || internship.salary ? (
                <p className="mt-2 text-xs font-semibold text-ink/50">
                  {[internship.employmentType, internship.salary].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <div className="mt-5 grid gap-2">
                <div className="flex gap-2">
                  <Link
                    className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-moss/50"
                    to={`/internships/${internship._id}`}
                  >
                    View Details
                  </Link>
                  {internship.applyLink ? (
                    <a
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-ink/10 px-3 text-xs font-bold text-ink transition hover:border-moss/50 hover:text-moss"
                      href={internship.applyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {internship.applicationLinkType === "direct" ? "Apply Now" : "View on job platform"}
                    </a>
                  ) : (
                    <span className="inline-flex min-h-10 flex-1 items-center justify-center rounded-md border border-ink/10 px-3 text-xs font-bold text-ink/45">
                      Application link unavailable
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="min-h-9 flex-1 px-3 text-xs"
                    variant="secondary"
                    icon={BookmarkPlus}
                    loading={busyId === internship._id && saveMutation.isPending}
                    onClick={() => saveMutation.mutate(internship._id)}
                  >
                    Save
                  </Button>
                  <Link
                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md bg-ink px-3 text-xs font-semibold text-white"
                    to={`/internships/${internship._id}?prepare=1`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Prepare
                  </Link>
                </div>
              </div>
            </article>
              ))}
            </div>
          ) : null)
        ) : (
          <div className="rounded-lg border border-dashed border-ink/15 bg-white p-8 text-sm font-semibold text-ink/60 md:col-span-2 xl:col-span-3">
            {liveSearchQuery.data?.failedSearches && internships.length === 0
              ? "Some role searches failed, so results may be incomplete. Retry to check again."
              : internships.length
                ? "No jobs match the selected filters."
                : `No current suitable live jobs were found for ${submittedRoleQuery || recommendationRoles.join(", ")}.`}{" "}
            <button
              type="button"
              className="font-black text-moss"
              onClick={() => {
                showProfileRecommendations();
              }}
            >
              {submittedRoleQuery ? "Show profile recommendations" : "Retry recommendations"}
            </button>{" "}
            Try another role or adjust the filters.
          </div>
        )}
      </section>
    </div>
  );
}
