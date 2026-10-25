import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Pencil, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import { profileApi } from "../api/queries";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { Field, inputClass } from "../components/Field";
import { LoadingState } from "../components/LoadingState";
import { ResumeUploadCard } from "../components/ResumeUploadCard";
import { useAuthStore } from "../store/authStore";
import { cx, formatDate } from "../utils/format";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "resume", label: "Resume" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "projects", label: "Projects" },
  { id: "experience", label: "Experience" },
  { id: "preferences", label: "Career Preferences" }
];

function linesToText(items = []) {
  return (items || []).join("\n");
}

function textToLines(value = "") {
  return String(value)
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function Profile() {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((state) => state.setSession);
  const token = useAuthStore((state) => state.token);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((item) => item.id === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "overview";
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");

  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: profileApi.get });
  const historyQuery = useQuery({ queryKey: ["profile-history"], queryFn: profileApi.history });
  const profile = profileQuery.data?.profile;
  const user = profileQuery.data?.user;
  const completeness = profileQuery.data?.completeness ?? 0;

  const overviewForm = useForm();
  const sectionForm = useForm();
  const preferencesForm = useForm();

  useEffect(() => {
    if (!profile) return;
    overviewForm.reset({
      name: user?.name || "",
      headline: profile.headline || "",
      phone: profile.phone || "",
      location: profile.location || "",
      portfolioUrl: profile.portfolioUrl || "",
      githubUrl: profile.githubUrl || "",
      linkedinUrl: profile.linkedinUrl || ""
    });
    sectionForm.reset({
      education: linesToText(profile.education),
      skills: linesToText(profile.skills),
      projects: linesToText(profile.projects),
      experience: linesToText(profile.experience)
    });
    preferencesForm.reset({
      roles: profile.preferences?.roles?.join(", ") || "",
      location: profile.preferences?.location || "",
      workMode: profile.preferences?.workMode || "",
      stipendRange: profile.preferences?.stipendRange || "",
      availability: profile.preferences?.availability || ""
    });
  }, [profile, user, overviewForm, sectionForm, preferencesForm]);

  const invalidateProfile = async (result) => {
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    await queryClient.invalidateQueries({ queryKey: ["analytics"] });
    if (result?.user?.name) {
      setSession({ token, user: { ...(useAuthStore.getState().user || {}), name: result.user.name } });
    }
  };

  const profileMutation = useMutation({
    mutationFn: profileApi.update,
    onSuccess: async (result) => {
      setNotice("Profile saved.");
      setEditing(false);
      await invalidateProfile(result);
    }
  });

  const preferencesMutation = useMutation({
    mutationFn: profileApi.updatePreferences,
    onSuccess: async () => {
      setNotice("Preferences saved.");
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
  });

  const history = historyQuery.data?.history || [];

  const setTab = (next) => {
    setEditing(false);
    setNotice("");
    setSearchParams(next === "overview" ? {} : { tab: next });
  };

  const cancelEdit = () => {
    setEditing(false);
    setNotice("");
    overviewForm.reset();
    sectionForm.reset();
    preferencesForm.reset();
    if (profile) {
      overviewForm.reset({
        name: user?.name || "",
        headline: profile.headline || "",
        phone: profile.phone || "",
        location: profile.location || "",
        portfolioUrl: profile.portfolioUrl || "",
        githubUrl: profile.githubUrl || "",
        linkedinUrl: profile.linkedinUrl || ""
      });
      sectionForm.reset({
        education: linesToText(profile.education),
        skills: linesToText(profile.skills),
        projects: linesToText(profile.projects),
        experience: linesToText(profile.experience)
      });
      preferencesForm.reset({
        roles: profile.preferences?.roles?.join(", ") || "",
        location: profile.preferences?.location || "",
        workMode: profile.preferences?.workMode || "",
        stipendRange: profile.preferences?.stipendRange || "",
        availability: profile.preferences?.availability || ""
      });
    }
  };

  const saveOverview = overviewForm.handleSubmit((values) => profileMutation.mutate(values));
  const saveSection = sectionForm.handleSubmit((values) => {
    const payload = {};
    if (tab === "education") payload.education = textToLines(values.education);
    if (tab === "skills") payload.skills = textToLines(values.skills);
    if (tab === "projects") payload.projects = textToLines(values.projects);
    if (tab === "experience") payload.experience = textToLines(values.experience);
    profileMutation.mutate(payload);
  });
  const savePreferences = preferencesForm.handleSubmit((values) => preferencesMutation.mutate(values));

  const links = useMemo(
    () =>
      [
        { label: "Portfolio", href: profile?.portfolioUrl },
        { label: "GitHub", href: profile?.githubUrl },
        { label: "LinkedIn", href: profile?.linkedinUrl }
      ].filter((item) => item.href),
    [profile]
  );

  if (profileQuery.isLoading) return <LoadingState label="Loading profile" />;

  return (
    <div className="grid gap-6">
      <ErrorBanner
        error={
          profileQuery.error ||
          historyQuery.error ||
          profileMutation.error ||
          preferencesMutation.error
        }
      />
      {notice ? <p className="rounded-md bg-moss/10 px-3 py-2 text-sm font-bold text-moss">{notice}</p> : null}

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-ink">{user?.name || "Your profile"}</h2>
            <p className="text-sm font-semibold text-ink/55">
              {user?.email || "No email"} · Completeness {completeness}%
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button
                  variant="secondary"
                  icon={X}
                  onClick={cancelEdit}
                  disabled={profileMutation.isPending || preferencesMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  icon={Save}
                  loading={profileMutation.isPending || preferencesMutation.isPending}
                  onClick={() => {
                    if (tab === "overview") saveOverview();
                    else if (tab === "preferences") savePreferences();
                    else if (["education", "skills", "projects", "experience"].includes(tab)) saveSection();
                  }}
                >
                  Save Changes
                </Button>
              </>
            ) : (
              <Button
                icon={Pencil}
                variant="secondary"
                disabled={tab === "resume"}
                onClick={() => setEditing(true)}
              >
                Edit Profile
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-moss" style={{ width: `${completeness}%` }} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-b border-ink/10 pb-3">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cx(
                "rounded-md px-3 py-2 text-sm font-bold transition",
                tab === item.id ? "bg-ink text-white" : "bg-paper text-ink/65 hover:text-ink"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === "overview" ? (
            editing ? (
              <form className="grid gap-4 md:grid-cols-2" onSubmit={saveOverview}>
                <Field label="Name">
                  <input className={inputClass} {...overviewForm.register("name", { required: true })} />
                </Field>
                <Field label="Headline">
                  <input className={inputClass} placeholder="Aspiring frontend intern" {...overviewForm.register("headline")} />
                </Field>
                <Field label="Phone">
                  <input className={inputClass} {...overviewForm.register("phone")} />
                </Field>
                <Field label="Location">
                  <input className={inputClass} {...overviewForm.register("location")} />
                </Field>
                <Field label="Portfolio URL">
                  <input className={inputClass} placeholder="https://" {...overviewForm.register("portfolioUrl")} />
                </Field>
                <Field label="GitHub URL">
                  <input className={inputClass} placeholder="https://" {...overviewForm.register("githubUrl")} />
                </Field>
                <Field label="LinkedIn URL">
                  <input className={inputClass} placeholder="https://" {...overviewForm.register("linkedinUrl")} />
                </Field>
              </form>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="Name" value={user?.name} />
                <Info label="Email" value={user?.email} />
                <Info label="Headline" value={profile?.headline} />
                <Info label="Phone" value={profile?.phone} />
                <Info label="Location" value={profile?.location || profile?.preferences?.location} />
                <div className="md:col-span-2">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/45">Links</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {links.length ? (
                      links.map((item) => (
                        <a
                          key={item.label}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full bg-moss/10 px-3 py-1 text-xs font-black text-moss"
                        >
                          {item.label}
                        </a>
                      ))
                    ) : (
                      <p className="text-sm font-semibold text-ink/55">No portfolio or social links yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : null}

          {tab === "resume" ? (
            <div className="grid gap-6">
              <ResumeUploadCard profile={profile} />
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/internships"
                  className="inline-flex min-h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white"
                >
                  Compare with Internships
                </Link>
                <Link
                  to="/analytics#skill-roadmap"
                  className="inline-flex min-h-10 items-center rounded-md border border-ink/10 bg-white px-4 text-sm font-semibold text-ink"
                >
                  Improve Skills
                </Link>
              </div>
            </div>
          ) : null}

          {["education", "skills", "projects", "experience"].includes(tab) ? (
            editing ? (
              <form className="grid gap-4" onSubmit={saveSection}>
                <Field
                  label={
                    tab === "skills"
                      ? "Skills (comma or new line)"
                      : `${tab[0].toUpperCase()}${tab.slice(1)} (one entry per line)`
                  }
                >
                  <textarea
                    className={`${inputClass} min-h-40`}
                    {...sectionForm.register(tab)}
                  />
                </Field>
              </form>
            ) : (
              <ProfileList items={profile?.[tab]} empty={`No ${tab} yet. Edit to add entries from your resume or manually.`} />
            )
          ) : null}

          {tab === "preferences" ? (
            editing ? (
              <form className="grid gap-4" onSubmit={savePreferences}>
                <Field label="Desired roles">
                  <input className={inputClass} placeholder="frontend, mern, ai product" {...preferencesForm.register("roles")} />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Preferred location">
                    <input className={inputClass} {...preferencesForm.register("location")} />
                  </Field>
                  <Field label="Work mode">
                    <select className={inputClass} {...preferencesForm.register("workMode")}>
                      <option value="">Any</option>
                      <option value="Remote">Remote</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="On-site">On-site</option>
                    </select>
                  </Field>
                  <Field label="Stipend range">
                    <input className={inputClass} {...preferencesForm.register("stipendRange")} />
                  </Field>
                  <Field label="Availability">
                    <input className={inputClass} placeholder="Immediate / Summer 2026" {...preferencesForm.register("availability")} />
                  </Field>
                </div>
              </form>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="Roles" value={(profile?.preferences?.roles || []).join(", ")} />
                <Info label="Location" value={profile?.preferences?.location} />
                <Info label="Work mode" value={profile?.preferences?.workMode} />
                <Info label="Stipend" value={profile?.preferences?.stipendRange} />
                <Info label="Availability" value={profile?.preferences?.availability} />
              </div>
            )
          ) : null}
        </div>
      </section>

      {tab === "resume" ? (
        <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-ink/50" />
            <div>
              <h2 className="text-xl font-black text-ink">Resume History</h2>
              <p className="text-sm font-semibold text-ink/55">
                Previous resumes are archived when you replace the active one. Matching history stays available here.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            {history.length ? (
              history.map((entry) => (
                <div key={entry._id} className="rounded-md border border-ink/10 bg-paper p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-black text-ink">{entry.label || "Previous resume"}</p>
                    <p className="text-xs font-bold text-ink/50">
                      Replaced {formatDate(entry.supersededAt || entry.createdAt)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(entry.skills || []).slice(0, 12).map((skill) => (
                      <span key={skill} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-black text-ink/65">
                        {skill}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs font-bold text-ink/55">
                    {entry.matchCount || 0} matches ({entry.highMatchCount || 0} high) · {entry.resumeVersionCount || 0}{" "}
                    resume versions
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm font-semibold text-ink/55">
                No previous resumes yet. When you upload a new resume, the current one is archived here.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink/70">{value || "Not set"}</p>
    </div>
  );
}

function ProfileList({ items = [], empty }) {
  if (!items.length) return <p className="text-sm font-semibold text-ink/55">{empty}</p>;
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-md bg-paper px-3 py-2 text-sm font-semibold text-ink/70">
          {item}
        </li>
      ))}
    </ul>
  );
}
