import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Compass,
  Sparkles,
  Target
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  applicationApi,
  internshipApi,
  matchApi,
  notificationApi,
  profileApi
} from "../api/queries";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingState } from "../components/LoadingState";
import { MetricCard } from "../components/MetricCard";
import { formatDate } from "../utils/format";

function nextBestAction({ profile, internships, applications, highMatches }) {
  if (!profile?.resumeText) {
    return {
      title: "Analyze your resume",
      detail: "Upload a readable PDF to get personalized internship matches and application guidance.",
      to: "/profile?tab=resume",
      cta: "Analyze Resume"
    };
  }
  if (!internships.some((item) => item.match)) {
    return {
      title: "Generate personalized matches",
      detail: "Sync opportunities and score them against your skills and preferences.",
      to: "/internships",
      cta: "Open Explorer"
    };
  }
  if (highMatches.length && !applications.some((app) => String(app.internshipId) === String(highMatches[0]._id))) {
    return {
      title: "Prepare a strong application",
      detail: `${highMatches[0].title} at ${highMatches[0].company} is a ${highMatches[0].match?.score}% match.`,
      to: `/internships/${highMatches[0]._id}`,
      cta: "Prepare Application"
    };
  }
  const preparing = applications.find((app) => app.status === "PREPARING");
  if (preparing) {
    return {
      title: "Finish and submit your draft",
      detail: `Review materials for ${preparing.internship?.title || "your open draft"}, then mark Applied after you submit.`,
      to: "/tracker?status=PREPARING",
      cta: "Open Tracker"
    };
  }
  const missing = profile?.analysis?.missingSkills?.[0];
  if (missing) {
    return {
      title: `Build skill: ${missing}`,
      detail: "Close a skill gap that appears across your recommended internships.",
      to: "/analytics#skill-roadmap",
      cta: "View Roadmap"
    };
  }
  return {
    title: "Review upcoming deadlines",
    detail: "Check alerts and tracker dates so nothing slips.",
    to: "/tracker",
    cta: "Open Tracker"
  };
}

export function Dashboard() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: profileApi.get });
  const profile = profileQuery.data?.profile;
  const hasResume = Boolean(profile?.resumeText);
  const internshipsQuery = useQuery({
    queryKey: ["internships"],
    queryFn: internshipApi.list
  });
  const applicationsQuery = useQuery({ queryKey: ["applications"], queryFn: applicationApi.list });
  const notificationsQuery = useQuery({ queryKey: ["notifications"], queryFn: notificationApi.list });

  const matchMutation = useMutation({
    mutationFn: matchApi.generate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internships"] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
    }
  });

  if (profileQuery.isLoading || internshipsQuery.isLoading || applicationsQuery.isLoading) {
    return <LoadingState label="Preparing workspace" />;
  }

  const internships = internshipsQuery.data?.internships || [];
  const applications = (applicationsQuery.data?.applications || []).filter((item) => !item.archived);
  const notifications = notificationsQuery.data?.notifications || [];
  const unread = notifications.filter((item) => !item.read);
  const highMatches = internships
    .filter((item) => item.match?.score >= 70)
    .sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0));
  const personalizedMatches = internships.filter((item) => item.match).length;
  const activeApplications = applications.filter((item) =>
    ["SAVED", "PREPARING", "APPLIED", "INTERVIEW"].includes(item.status)
  );
  const recommended = internships
    .filter((item) => item.match)
    .slice()
    .sort((a, b) => (b.match?.score || 0) - (a.match?.score || 0))
    .slice(0, 3);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = applications
    .filter((item) => ["SAVED", "PREPARING", "APPLIED", "INTERVIEW"].includes(item.status))
    .flatMap((application) =>
      [
        { label: "Interview", date: application.interviewDate },
        { label: "Next step", date: application.nextActionDate },
        { label: "Deadline", date: application.internship?.deadline }
      ]
        .filter(({ date }) => date && Number.isFinite(new Date(date).getTime()) && new Date(date) >= today)
        .map((event) => ({ ...event, application }))
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 4);
  const recentActivity = notifications.slice(0, 3);
  const action = nextBestAction({ profile, internships, applications, highMatches });

  return (
    <div className="grid gap-6">
      <ErrorBanner
        error={
          matchMutation.error ||
          profileQuery.error ||
          internshipsQuery.error ||
          applicationsQuery.error ||
          notificationsQuery.error
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Internships"
          value={internships.length}
          icon={Compass}
          tone="moss"
          to="/internships"
          hint="Open Explorer"
        />
        <MetricCard
          label="Personalized Matches"
          value={personalizedMatches}
          icon={Sparkles}
          tone="gold"
          to="/internships?sort=match"
          hint="Scored for your profile"
        />
        <MetricCard
          label="Active Applications"
          value={activeApplications.length}
          icon={BriefcaseBusiness}
          tone="ink"
          to="/tracker?status=APPLIED"
          hint="In progress"
        />
        <MetricCard
          label="Unread Alerts"
          value={unread.length}
          icon={Bell}
          tone="coral"
          to="/tracker?focus=alerts"
          hint="Deadlines & updates"
        />
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-ink">Recommended Internships</h2>
            <p className="text-sm font-semibold text-ink/55">Your top opportunities by personalized match score</p>
          </div>
          <Button
            icon={Sparkles}
            loading={matchMutation.isPending}
            disabled={!hasResume}
            onClick={() => matchMutation.mutate()}
          >
            Find & Match
          </Button>
        </div>
        {hasResume ? (
          <div className="grid gap-3">
            {recommended.length ? (
              recommended.map((internship) => (
                <Link
                  key={internship._id}
                  to={`/internships/${internship._id}`}
                  className="grid items-center gap-3 rounded-md border border-ink/10 p-4 transition hover:border-moss/50 md:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <h3 className="font-black text-ink">{internship.title}</h3>
                    <p className="text-sm font-semibold text-ink/55">{internship.company}</p>
                  </div>
                  <p className="text-lg font-black text-moss">{internship.match.score}% match</p>
                  <span className="text-sm font-black text-moss">View Details <ArrowRight className="inline h-4 w-4" /></span>
                </Link>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-ink/15 bg-paper p-5 text-sm font-semibold text-ink/60">
                No personalized matches yet. Select <span className="font-black text-ink">Find &amp; Match</span> to score opportunities against your profile.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-ink/15 bg-paper p-5 text-sm font-semibold text-ink/60">
            Analyze your resume to see relevant opportunities.{" "}
            <Link className="font-black text-moss" to="/profile?tab=resume">
              Go to Resume
            </Link>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-moss/10 text-moss">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-ink">Next Best Action</h2>
            <p className="mt-1 text-sm font-black text-ink">{action.title}</p>
            <p className="mt-1 text-sm font-semibold text-ink/60">{action.detail}</p>
            <Link
              to={action.to}
              className="mt-3 inline-flex items-center gap-2 text-sm font-black text-moss"
            >
              {action.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-ink">Upcoming Deadlines</h2>
            <Link to="/tracker" className="text-sm font-black text-moss">
              View tracker
            </Link>
          </div>
          <div className="grid gap-3">
            {upcoming.length ? (
              upcoming.map(({ application, date, label }) => (
                <Link
                  key={`${application._id}-${label}`}
                  to={`/tracker?focus=${application._id}`}
                  className="flex items-center justify-between gap-3 rounded-md bg-paper p-3 transition hover:bg-moss/5"
                >
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-ink/45">{label}</p>
                    <p className="text-sm font-black text-ink">{application.internship?.title}</p>
                    <p className="text-xs font-bold text-ink/50">{application.internship?.company}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-ink/60">{formatDate(date)}</span>
                </Link>
              ))
            ) : (
              <p className="text-sm font-semibold text-ink/55">No upcoming interviews or application deadlines.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-ink">Recent Activity</h2>
            <span className="text-xs font-black text-coral">{unread.length} unread</span>
          </div>
          <div className="grid gap-3">
            {recentActivity.length ? (
              recentActivity.map((notification) => (
                <div
                  key={notification._id}
                  className={`rounded-md p-3 ${notification.read ? "bg-paper" : "bg-moss/5"}`}
                >
                  <p className="text-sm font-black text-ink">{notification.title}</p>
                  <p className="mt-1 text-xs font-semibold text-ink/60">{notification.message}</p>
                  <p className="mt-1 text-[11px] font-bold text-ink/40">{formatDate(notification.createdAt)}</p>
                </div>
              ))
            ) : (
              <p className="text-sm font-semibold text-ink/55">Application updates will appear here.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
