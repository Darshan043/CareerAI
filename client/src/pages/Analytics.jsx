import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BarChart3,
  BriefcaseBusiness,
  Percent,
  Route,
  Sparkles,
  TrendingUp
} from "lucide-react";
import { Link } from "react-router-dom";
import { analyticsApi, profileApi } from "../api/queries";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { MetricCard } from "../components/MetricCard";

export function Analytics() {
  const queryClient = useQueryClient();
  const analyticsQuery = useQuery({ queryKey: ["analytics"], queryFn: analyticsApi.get });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: profileApi.get });
  const skillMutation = useMutation({
    mutationFn: profileApi.updateSkillProgress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
  });

  if (analyticsQuery.isLoading || profileQuery.isLoading) return <LoadingState label="Loading analytics" />;

  const analytics = analyticsQuery.data?.analytics || {};
  const profile = profileQuery.data?.profile;
  const byStatus = analytics.applicationsByStatus || {};
  const statusEntries = Object.entries(byStatus);
  const maxStatus = Math.max(1, ...statusEntries.map(([, count]) => count));
  const progress = analytics.progressOverTime || [];
  const maxProgress = Math.max(1, ...progress.map((item) => item.count));
  const skillGaps = analytics.skillGaps?.length
    ? analytics.skillGaps
    : (profile?.analysis?.missingSkills || []).map((skill) => ({ skill, status: "not_started" }));
  const progressMap = new Map((profile?.skillProgress || []).map((item) => [item.skill.toLowerCase(), item.status]));

  const rateLabel = (value, available = true) => {
    if (!available || value == null) return "N/A";
    return `${value}%`;
  };

  return (
    <div className="grid gap-6">
      <ErrorBanner error={analyticsQuery.error || profileQuery.error || skillMutation.error} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total applications"
          value={analytics.totalApplications || 0}
          icon={BriefcaseBusiness}
          tone="ink"
          to="/tracker"
          hint="Open tracker"
        />
        <MetricCard
          label="Interviews"
          value={analytics.interviewCount || 0}
          icon={Percent}
          tone="moss"
          to="/tracker?status=INTERVIEW"
        />
        <MetricCard
          label="Offers"
          value={analytics.offerCount || 0}
          icon={Award}
          tone="gold"
          to="/tracker?status=OFFER"
        />
        <MetricCard
          label="High matches"
          value={analytics.personalizedMatchCount || 0}
          icon={Sparkles}
          tone="coral"
          to="/internships?sort=match&minScore=70"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Interview rate"
          value={rateLabel(analytics.interviewRate, analytics.totalApplications > 0)}
          icon={Percent}
          tone="moss"
          hint={analytics.interviewRate == null ? "Needs submitted applications" : "Of submitted apps"}
        />
        <MetricCard
          label="Offer rate"
          value={rateLabel(analytics.offerRate, analytics.totalApplications > 0)}
          icon={Award}
          tone="gold"
          hint={analytics.offerRate == null ? "Needs submitted applications" : "Of submitted apps"}
        />
        <MetricCard
          label="Response rate"
          value={rateLabel(analytics.responseRate, analytics.responseRateAvailable)}
          icon={BarChart3}
          tone="ink"
          hint={
            analytics.responseRateAvailable
              ? "Interview + offer + rejected / submitted"
              : "Shown after 3+ submitted applications"
          }
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h2 className="text-xl font-black text-ink">Applications by status</h2>
          <p className="text-sm font-semibold text-ink/55">Click a bar to open the filtered tracker</p>
          <div className="mt-5 grid gap-3">
            {statusEntries.some(([, count]) => count > 0) ? (
              statusEntries.map(([status, count]) => (
                <Link key={status} to={`/tracker?status=${status}`} className="grid gap-1">
                  <div className="flex items-center justify-between text-sm font-bold text-ink/70">
                    <span>{status}</span>
                    <span>{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-moss"
                      style={{ width: `${Math.round((count / maxStatus) * 100)}%` }}
                    />
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-sm font-semibold text-ink/55">No tracked applications yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h2 className="text-xl font-black text-ink">Application progress over time</h2>
          <p className="text-sm font-semibold text-ink/55">Monthly volume from create/apply dates</p>
          <div className="mt-5 flex h-48 items-end gap-3">
            {progress.length ? (
              progress.map((item) => (
                <div key={item.month} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className="w-full rounded-t-md bg-moss/80"
                    style={{ height: `${Math.max(8, Math.round((item.count / maxProgress) * 100))}%` }}
                    title={`${item.month}: ${item.count}`}
                  />
                  <span className="text-[10px] font-bold text-ink/45">{item.month.slice(5)}</span>
                </div>
              ))
            ) : (
              <p className="self-center text-sm font-semibold text-ink/55">Not enough dated activity to chart yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h2 className="text-xl font-black text-ink">Skills in demand</h2>
          <div className="mt-4 grid gap-3">
            {(analytics.frequentlyRequiredSkills || analytics.topPerformingSkills || []).length ? (
              (analytics.frequentlyRequiredSkills || analytics.topPerformingSkills).map((item) => (
                <Link
                  key={item.skill}
                  to={`/internships?skill=${encodeURIComponent(item.skill)}`}
                  className="flex items-center justify-between rounded-md bg-paper p-3 transition hover:bg-moss/5"
                >
                  <span className="font-black text-ink">{item.skill}</span>
                  <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-black text-moss">{item.count}</span>
                </Link>
              ))
            ) : (
              <p className="text-sm font-semibold text-ink/55">Generate matches to see required skill trends.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-gold/15 text-gold">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-ink">Recommendations</h2>
              <p className="text-sm font-semibold text-ink/55">
                Match effectiveness{" "}
                {analytics.matchScoreEffectiveness != null ? `${analytics.matchScoreEffectiveness}%` : "N/A"}
                {analytics.resumeAnalysisHistoryCount
                  ? ` · ${analytics.resumeAnalysisHistoryCount} prior resume archive(s)`
                  : ""}
              </p>
            </div>
          </div>
          <p className="mt-5 rounded-md bg-paper p-4 text-sm font-semibold leading-6 text-ink/65">
            {analytics.recommendationNote}
          </p>
          {(analytics.strongSkills || []).length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {analytics.strongSkills.map((skill) => (
                <span key={skill} className="rounded-full bg-moss/10 px-3 py-1 text-xs font-black text-moss">
                  {skill}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section id="skill-roadmap" className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-moss/10 text-moss">
              <Route className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-ink">Personalized Skill Roadmap</h2>
              <p className="text-sm font-semibold text-ink/55">
                Based on missing skills from your resume analysis and matched internships
              </p>
            </div>
          </div>
          <Link to="/profile?tab=skills" className="text-sm font-black text-moss">
            Edit skills
          </Link>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-md bg-paper p-4">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-ink/45">Current skills</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {(profile?.skills || []).length ? (
                profile.skills.slice(0, 16).map((skill) => (
                  <span key={skill} className="rounded-full bg-moss/10 px-3 py-1 text-xs font-black text-moss">
                    {skill}
                  </span>
                ))
              ) : (
                <p className="text-sm font-semibold text-ink/55">Upload a resume to detect skills.</p>
              )}
            </div>
          </div>
          <div className="rounded-md bg-paper p-4">
            <h3 className="text-sm font-black uppercase tracking-[0.14em] text-ink/45">Learning order</h3>
            <ol className="mt-3 grid gap-3">
              {skillGaps.length ? (
                skillGaps.map((item, index) => {
                  const status = progressMap.get(String(item.skill).toLowerCase()) || item.status || "not_started";
                  return (
                    <li key={item.skill} className="rounded-md border border-ink/10 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-black text-ink">
                          {index + 1}. {item.skill}
                        </p>
                        <span className="text-xs font-bold uppercase tracking-wide text-ink/45">{status.replace("_", " ")}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ink/60">
                        Practice with a small project that demonstrates {item.skill}, then mark progress.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          className="min-h-9 px-3 text-xs"
                          variant="secondary"
                          loading={skillMutation.isPending && skillMutation.variables?.skill === item.skill}
                          onClick={() => skillMutation.mutate({ skill: item.skill, status: "started" })}
                        >
                          Mark Started
                        </Button>
                        <Button
                          className="min-h-9 px-3 text-xs"
                          loading={skillMutation.isPending && skillMutation.variables?.skill === item.skill}
                          onClick={() => skillMutation.mutate({ skill: item.skill, status: "completed" })}
                        >
                          Mark Completed
                        </Button>
                      </div>
                    </li>
                  );
                })
              ) : (
                <p className="text-sm font-semibold text-ink/55">
                  No skill gaps identified yet. Analyze your resume and generate matches first.
                </p>
              )}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
