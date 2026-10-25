import {
  ArrowRight,
  BellRing,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  ClipboardCheck,
  FileText,
  Radar,
  Route
} from "lucide-react";
import { Link } from "react-router-dom";
import { cx } from "../utils/format";

export function WorkflowGraph({
  className = "",
  profile,
  internships = [],
  applications = [],
  notifications = [],
  resumeVersions = [],
  nextAction
}) {
  const hasResume = Boolean(profile?.resumeText);
  const hasInternships = internships.length > 0;
  const hasMatches = internships.some((item) => Boolean(item.match));
  const hasSkillGaps = internships.some((item) => item.match?.missingSkills?.length > 0);
  const hasResumeVersion = resumeVersions.length > 0;
  const hasApplication = applications.length > 0;
  const hasOutcome = applications.some((item) => ["INTERVIEW", "OFFER", "REJECTED"].includes(item.status));
  const hasAlert = notifications.length > 0;

  const nodes = [
    { label: "Analyze Resume", icon: FileText, active: hasResume, to: "/profile?tab=resume" },
    { label: "Discover Roles", icon: Radar, active: hasInternships, to: "/internships" },
    { label: "Match Fit", icon: BrainCircuit, active: hasMatches, to: "/internships?sort=match" },
    { label: "Skill Gaps", icon: Route, active: hasSkillGaps, to: "/analytics#skill-roadmap" },
    { label: "Prepare App", icon: Bot, active: hasResumeVersion, to: "/tracker?status=PREPARING" },
    { label: "Track Status", icon: BriefcaseBusiness, active: hasApplication, to: "/tracker" },
    { label: "Outcomes", icon: ClipboardCheck, active: hasOutcome, to: "/analytics" },
    { label: "Alerts", icon: BellRing, active: hasAlert, to: "/tracker?focus=alerts" }
  ];

  const activeCount = nodes.filter((node) => node.active).length;
  const nextNode = nodes.find((node) => !node.active) || nodes[nodes.length - 1];

  return (
    <section className={cx("rounded-lg border border-ink/10 bg-white p-5 shadow-soft", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-ink">AI Internship Co-Pilot</h2>
          <p className="text-sm font-semibold text-ink/55">
            Guided path from resume analysis to tracked outcomes
          </p>
        </div>
        <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-black text-moss">
          {activeCount}/{nodes.length} stages active
        </span>
      </div>

      {nextAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-moss/20 bg-moss/5 px-4 py-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-moss">Current next step</p>
            <p className="mt-1 text-sm font-black text-ink">{nextAction.title}</p>
          </div>
          <Link
            to={nextAction.to || nextNode.to}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-3 py-2 text-xs font-black text-white"
          >
            {nextAction.cta || "Continue"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

      <div className="mt-5 pb-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {nodes.map((node, index) => (
            <Link key={node.label} to={node.to} className="relative block">
              {index < nodes.length - 1 ? (
                <span
                  className={cx(
                    "absolute left-[calc(50%+28px)] top-7 hidden h-0.5 w-[calc(100%-24px)] md:block",
                    nodes[index + 1].active ? "bg-moss" : "bg-ink/10"
                  )}
                />
              ) : null}
              <div
                className={cx(
                  "relative grid min-h-28 place-items-center rounded-md border p-3 text-center transition hover:border-moss/40",
                  node.active ? "border-moss/30 bg-moss/5" : "border-ink/10 bg-paper"
                )}
              >
                <div
                  className={cx(
                    "grid h-12 w-12 place-items-center rounded-md",
                    node.active ? "bg-moss text-white" : "bg-white text-ink/45"
                  )}
                >
                  <node.icon className="h-5 w-5" />
                </div>
                <p className="mt-3 text-sm font-black text-ink">{node.label}</p>
                <span className={cx("mt-1 text-xs font-black", node.active ? "text-moss" : "text-ink/40")}>
                  {node.active ? "Done" : "Next"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
