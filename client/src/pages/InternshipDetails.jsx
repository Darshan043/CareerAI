import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Sparkles
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { applicationApi, internshipApi, materialApi, skillGapApi } from "../api/queries";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/ErrorBanner";
import { inputClass } from "../components/Field";
import { LoadingState } from "../components/LoadingState";
import { formatDate } from "../utils/format";

export function InternshipDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [generatedVersion, setGeneratedVersion] = useState(null);
  const [applicationNotice, setApplicationNotice] = useState("");
  const [externalOpened, setExternalOpened] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [editing, setEditing] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const [draftCover, setDraftCover] = useState("");
  const [draftBulletSuggestions, setDraftBulletSuggestions] = useState([]);
  const [draftAnswers, setDraftAnswers] = useState([]);
  const autoPrepareRef = useRef(false);

  const internshipQuery = useQuery({
    queryKey: ["internship", id],
    queryFn: () => internshipApi.get(id),
    enabled: Boolean(id)
  });
  const internshipsQuery = useQuery({ queryKey: ["internships"], queryFn: internshipApi.list });
  const resumeVersionsQuery = useQuery({ queryKey: ["resume-versions"], queryFn: materialApi.list });

  const internship = useMemo(() => {
    if (internshipQuery.data?.internship) return internshipQuery.data.internship;
    return internshipsQuery.data?.internships?.find((item) => String(item._id) === String(id));
  }, [internshipQuery.data, internshipsQuery.data, id]);

  const existingVersion = useMemo(
    () =>
      resumeVersionsQuery.data?.resumeVersions?.find((version) => String(version.internshipId) === String(id)),
    [resumeVersionsQuery.data, id]
  );
  const resumeVersion = generatedVersion || existingVersion;

  useEffect(() => {
    if (resumeVersion) {
      setDraftContent(resumeVersion.content || "");
      setDraftCover(resumeVersion.coverLetter || "");
      setDraftBulletSuggestions(resumeVersion.resumeBulletSuggestions || []);
      setDraftAnswers(resumeVersion.applicationAnswers || []);
    }
  }, [resumeVersion]);

  const skillGapQuery = useQuery({
    queryKey: ["skill-gap", id],
    queryFn: () => skillGapApi.get(id),
    enabled: Boolean(internship?.match)
  });

  const materialMutation = useMutation({
    mutationFn: materialApi.generate,
    onSuccess: (data) => {
      setGeneratedVersion(data.resumeVersion);
      setEditing(false);
      setPreviewMode(true);
      setApplicationNotice("Application draft generated and Tracker moved to Preparing.");
      queryClient.invalidateQueries({ queryKey: ["resume-versions"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  useEffect(() => {
    if (
      searchParams.get("prepare") !== "1" ||
      !internship?._id ||
      resumeVersionsQuery.isLoading ||
      resumeVersion ||
      autoPrepareRef.current
    ) {
      return;
    }
    autoPrepareRef.current = true;
    materialMutation.mutate(internship._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when prepare deep-link opens an unmatched internship
  }, [searchParams, internship?._id, resumeVersion, resumeVersionsQuery.isLoading]);

  const approveMutation = useMutation({
    mutationFn: materialApi.approve,
    onSuccess: (data) => {
      setGeneratedVersion(data.resumeVersion);
      queryClient.invalidateQueries({ queryKey: ["resume-versions"] });
    }
  });

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      materialApi.update(resumeVersion._id, {
        content: draftContent,
        coverLetter: draftCover,
        resumeBulletSuggestions: draftBulletSuggestions,
        applicationAnswers: draftAnswers
      }),
    onSuccess: (data) => {
      setGeneratedVersion(data.resumeVersion);
      setEditing(false);
      setApplicationNotice("Draft saved. Linked to this internship in Tracker (Preparing).");
      queryClient.invalidateQueries({ queryKey: ["resume-versions"] });
    }
  });

  const applicationMutation = useMutation({
    mutationFn: applicationApi.create,
    onSuccess: () => {
      setApplicationNotice("Saved to Tracker under Saved.");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const markAppliedMutation = useMutation({
    mutationFn: () =>
      applicationApi.create({ internshipId: internship._id, status: "APPLIED", confirmedSubmitted: true }),
    onSuccess: () => {
      setApplicationNotice("Marked as Applied in Tracker. Final submission stays on the employer site.");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["analytics"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  if (internshipQuery.isLoading && internshipsQuery.isLoading) {
    return <LoadingState label="Loading opportunity" />;
  }
  if (!internship) {
    return (
      <div className="rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <ErrorBanner error={internshipQuery.error || internshipsQuery.error} />
        <p className="font-bold text-ink">
          {internshipQuery.error || internshipsQuery.error ? "Could not load this opportunity." : "Opportunity not found."}
        </p>
        {internshipQuery.error || internshipsQuery.error ? (
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => {
              internshipQuery.refetch();
              internshipsQuery.refetch();
            }}
          >
            Retry
          </Button>
        ) : null}
        <Link className="mt-3 inline-block font-black text-moss" to="/internships">
          Back to explorer
        </Link>
      </div>
    );
  }

  const skillGap = skillGapQuery.data?.skillGap;
  const handleExternalApply = () => {
    if (!internship.applyLink) return;
    window.open(internship.applyLink, "_blank", "noopener,noreferrer");
    setExternalOpened(true);
    setApplicationNotice(internship.applicationLinkType === "direct"
      ? "Direct application page opened. Mark Applied only after you submit there."
      : "Job platform listing opened. Continue to its application page, then mark Applied after submitting.");
  };
  const copyText = async (label, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice(`${label} copied.`);
    } catch {
      setCopyNotice("Copy is unavailable in this browser. Select the text and copy it manually.");
    }
  };
  const handleViewPdf = async () => {
    if (!resumeVersion?._id) return;
    setPdfLoading(true);
    setPdfError("");
    try {
      await materialApi.openPdf(resumeVersion._id);
    } catch {
      setPdfError("Could not open the resume PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };
  const handleDownloadPdf = async () => {
    if (!resumeVersion?._id) return;
    setPdfLoading(true);
    setPdfError("");
    try {
      await materialApi.savePdf(resumeVersion._id, `careerpilot-${internship.company || "resume"}.pdf`);
    } catch {
      setPdfError("Could not download the resume PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <ErrorBanner
          error={
            materialMutation.error ||
            approveMutation.error ||
            saveDraftMutation.error ||
            applicationMutation.error ||
            markAppliedMutation.error ||
            skillGapQuery.error ||
            internshipQuery.error ||
            internshipsQuery.error ||
            resumeVersionsQuery.error
          }
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-gold">
              {internship.source}
              {internship.isSample ? " · Sample / starter example" : " · External listing"}
            </p>
            <h2 className="mt-2 text-3xl font-black text-ink">{internship.title}</h2>
            <p className="mt-1 text-base font-semibold text-ink/55">
              {internship.company} - {internship.location}
            </p>
          </div>
          <div className="grid h-20 w-24 place-items-center rounded-md bg-moss/10 text-3xl font-black text-moss">
            {internship.match ? `${internship.match.score}%` : "—"}
          </div>
        </div>

        <p className="mt-5 text-sm font-medium leading-7 text-ink/70">{internship.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {internship.skillsRequired?.map((skill) => (
            <span key={skill} className="rounded-full bg-ink/5 px-3 py-1 text-xs font-black text-ink/65">
              {skill}
            </span>
          ))}
        </div>
        <div className="mt-5 grid gap-3 rounded-md bg-paper p-4 text-sm font-semibold text-ink/65 sm:grid-cols-2">
          <p>Deadline: {internship.deadline ? formatDate(internship.deadline) : "Unverified"}</p>
          <p>Posted: {internship.postedDate ? formatDate(internship.postedDate) : "Unverified"}</p>
          {internship.employmentType ? <p>Employment type: {internship.employmentType}</p> : null}
          {internship.salary ? <p>Compensation: {internship.salary}</p> : null}
          {internship.publisher ? <p>Listed by: {internship.publisher}</p> : null}
          {internship.remote ? <p>Work mode: Remote</p> : null}
        </div>

        {internship.match ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <MatchBox title="Matched Skills" items={internship.match.matchedSkills} tone="moss" />
            <MatchBox title="Missing Skills" items={internship.match.missingSkills} tone="coral" />
          </div>
        ) : (
          <p className="mt-6 text-sm font-semibold text-ink/55">
            No match explanation yet. Generate matches from Explorer after uploading a resume.
          </p>
        )}
        {internship.match?.reason ? (
          <div className="mt-5 rounded-md border border-moss/20 bg-moss/5 p-4 text-sm font-semibold leading-6 text-ink/70">
            {internship.match.reason}
          </div>
        ) : null}
        {internship.match ? (
          <p className="mt-3 text-xs font-semibold text-ink/45">
            Fit score, not hiring probability. Based on resume skill overlap (up to 80 points), role preference (10), and location preference (10).
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            icon={Plus}
            variant="secondary"
            loading={applicationMutation.isPending}
            onClick={() => applicationMutation.mutate({ internshipId: internship._id, status: "SAVED" })}
          >
            Save Internship
          </Button>
          <Button
            icon={FileText}
            loading={materialMutation.isPending}
            onClick={() => materialMutation.mutate(internship._id)}
          >
            Prepare Application
          </Button>
          <Button icon={ExternalLink} disabled={!internship.applyLink} onClick={handleExternalApply}>
            {internship.applyLink
              ? internship.applicationLinkType === "direct" ? "Apply Now" : "View on job platform"
              : "Application link unavailable"}
          </Button>
          <Link
            to="/tracker"
            className="inline-flex min-h-10 items-center rounded-md border border-ink/10 bg-white px-4 text-sm font-semibold text-ink"
          >
            Track Application
          </Link>
        </div>
        {applicationNotice ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-md bg-moss/10 px-3 py-2 text-sm font-black text-moss">
            <CheckCircle2 className="h-4 w-4" />
            {applicationNotice}
          </p>
        ) : null}
        {externalOpened ? (
          <Button
            className="mt-3"
            icon={CheckCircle2}
            loading={markAppliedMutation.isPending}
            onClick={() => {
              if (window.confirm("Confirm that you submitted this application on the employer's website?")) {
                markAppliedMutation.mutate();
              }
            }}
          >
            Mark as Applied
          </Button>
        ) : null}
      </section>

      <aside className="grid gap-6">
        <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-black text-ink">Skill Roadmap</h3>
            <Link to="/analytics#skill-roadmap" className="text-xs font-black text-moss">
              Full roadmap
            </Link>
          </div>
          <div className="mt-4 grid gap-3">
            <p className="text-xs font-semibold text-ink/45">
              {skillGap?.aiGenerated
                ? `${skillGap.aiProvider || "AI"}-assisted plan; review recommendations.`
                : "Rule-based suggestions from the listed skill gaps."}
            </p>
            {skillGap?.priorities?.length ? (
              skillGap.priorities.map((item) => (
                <div key={item.skill} className="rounded-md bg-paper p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-ink">{item.skill}</p>
                    <span className="rounded-full bg-gold/15 px-2.5 py-1 text-xs font-black text-gold">
                      {item.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink/60">{item.suggestedAction}</p>
                  <p className="mt-2 text-sm font-semibold text-moss">{item.miniProject}</p>
                  <p className="mt-2 text-xs font-bold text-ink/45">Suggested effort: about {item.estimatedDays} days</p>
                  <ul className="mt-2 grid gap-1 text-xs font-semibold text-ink/55">
                    {(item.resources || []).map((resource) => (
                      <li key={resource.url}>
                        <a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-moss underline">
                          {resource.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <p className="text-sm font-semibold text-ink/55">Generate matches to view ranked gaps for this role.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-black text-ink">AI Application Assistant</h3>
            {resumeVersion?.approved ? (
              <span className="rounded-full bg-moss/10 px-3 py-1 text-xs font-black text-moss">Approved</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm font-semibold text-ink/55">
            Drafts use your profile and this internship only. Review before submitting externally.
          </p>
          {resumeVersion ? (
            <p className="mt-1 text-xs font-semibold text-ink/45">
              {resumeVersion.aiGenerated
                ? `${resumeVersion.aiProvider || "AI"}-assisted draft; verify all claims.`
                : "Template draft; AI generation was unavailable."}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              icon={resumeVersion ? RefreshCw : Sparkles}
              loading={materialMutation.isPending}
              onClick={() => materialMutation.mutate(internship._id)}
            >
              {resumeVersion ? "Regenerate" : "Generate Draft"}
            </Button>
            {resumeVersion ? (
              <>
                <Button variant="secondary" icon={Pencil} onClick={() => setEditing((value) => !value)}>
                  Edit
                </Button>
                <Button variant="secondary" icon={Eye} onClick={() => setPreviewMode((value) => !value)}>
                  Preview
                </Button>
                <Button
                  variant="secondary"
                  icon={Save}
                  loading={saveDraftMutation.isPending}
                  disabled={!editing}
                  onClick={() => saveDraftMutation.mutate()}
                >
                  Save Draft
                </Button>
              </>
            ) : null}
          </div>

          {resumeVersion ? (
            <div className="mt-4 grid gap-4">
              <ul className="grid gap-2 text-sm font-semibold text-ink/65">
                {resumeVersion.changeSummary?.map((item) => (
                  <li key={item} className="flex gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    {item}
                  </li>
                ))}
              </ul>

              {editing ? (
                <div className="grid gap-3">
                  <label className="grid gap-1 text-sm font-bold text-ink/65">
                    Resume bullet suggestions (one per line)
                    <textarea
                      className={`${inputClass} min-h-28`}
                      value={draftBulletSuggestions.join("\n")}
                      onChange={(event) => setDraftBulletSuggestions(
                        event.target.value.split("\n").slice(0, 8).map((item) => item.trim()).filter(Boolean)
                      )}
                    />
                  </label>
                  <textarea
                    className={`${inputClass} min-h-48 font-mono text-xs`}
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                  />
                  <label className="grid gap-1 text-sm font-bold text-ink/65">
                    Cover letter
                    <textarea
                      className={`${inputClass} min-h-32`}
                      value={draftCover}
                      onChange={(event) => setDraftCover(event.target.value)}
                    />
                  </label>
                  {draftAnswers.map((item, index) => (
                    <label key={`${item.question}-${index}`} className="grid gap-1 text-sm font-bold text-ink/65">
                      {item.question}
                      <textarea
                        className={`${inputClass} min-h-24`}
                        value={item.answer}
                        onChange={(event) => setDraftAnswers((current) =>
                          current.map((answer, answerIndex) =>
                            answerIndex === index ? { ...answer, answer: event.target.value } : answer
                          )
                        )}
                      />
                    </label>
                  ))}
                  <textarea
                    className={`${inputClass} min-h-32`}
                    value={draftCover}
                    onChange={(event) => setDraftCover(event.target.value)}
                  />
                </div>
              ) : (
                <pre
                  className={`max-h-80 overflow-auto whitespace-pre-wrap rounded-md p-4 text-sm leading-6 scrollbar-thin ${
                    previewMode ? "bg-paper text-ink" : "bg-ink text-white"
                  }`}
                >
                  {resumeVersion.content}
                </pre>
              )}

              <div className="grid gap-3 rounded-md border border-ink/10 bg-paper p-4">
                {resumeVersion.resumeBulletSuggestions?.length ? (
                  <div>
                    <h4 className="font-black text-ink">Resume bullet suggestions</h4>
                    <ul className="mt-2 grid gap-2 text-sm font-medium leading-6 text-ink/70">
                      {resumeVersion.resumeBulletSuggestions.map((suggestion) => (
                        <li key={suggestion}>• {suggestion}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-black text-ink">Cover letter draft</h4>
                  <Button
                    className="min-h-9 px-3 text-xs"
                    variant="secondary"
                    icon={ClipboardCopy}
                    onClick={() => copyText("Cover letter", resumeVersion.coverLetter || "")}
                  >
                    Copy
                  </Button>
                </div>
                {!editing ? (
                  <p className="whitespace-pre-wrap text-sm font-medium leading-6 text-ink/70">
                    {resumeVersion.coverLetter || "No cover letter draft was generated."}
                  </p>
                ) : null}
                {(editing ? draftAnswers : resumeVersion.applicationAnswers || []).map((item, index) => (
                  <div key={`${item.question}-${index}`} className="rounded-md bg-white p-3">
                    <p className="text-sm font-black text-ink">{item.question}</p>
                    {!editing ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-6 text-ink/65">{item.answer}</p>
                    ) : null}
                    <Button
                      className="mt-2 min-h-9 px-3 text-xs"
                      variant="secondary"
                      icon={ClipboardCopy}
                      onClick={() => copyText("Answer", item.answer)}
                    >
                      Copy answer
                    </Button>
                  </div>
                ))}
                <p className="text-xs font-semibold text-ink/45">
                  AI-assisted drafts can be wrong. Review and correct every detail before submitting.
                </p>
                {copyNotice ? <p className="text-xs font-bold text-moss">{copyNotice}</p> : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button icon={Eye} variant="secondary" loading={pdfLoading} onClick={handleViewPdf}>
                  Preview PDF
                </Button>
                <Button icon={Download} variant="secondary" loading={pdfLoading} onClick={handleDownloadPdf}>
                  Download PDF
                </Button>
                {!resumeVersion.approved ? (
                  <Button
                    icon={Check}
                    loading={approveMutation.isPending}
                    onClick={() => approveMutation.mutate(resumeVersion._id)}
                  >
                    Approve Version
                  </Button>
                ) : null}
                <Button icon={Send} onClick={handleExternalApply}>
                  Open Application Page
                </Button>
              </div>
              {pdfError ? <p className="text-sm font-bold text-coral">{pdfError}</p> : null}
            </div>
          ) : (
            <p className="mt-4 text-sm font-semibold text-ink/55">
              No draft yet. Use Generate Draft to create a tailored resume, cover letter, and answer suggestions.
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

function MatchBox({ title, items = [], tone }) {
  const color = tone === "moss" ? "bg-moss/10 text-moss" : "bg-coral/10 text-coral";
  return (
    <div className="rounded-md bg-paper p-4">
      <h3 className="text-sm font-black uppercase tracking-[0.16em] text-ink/45">{title}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length ? (
          items.map((item) => (
            <span key={item} className={`rounded-full px-3 py-1 text-xs font-black ${color}`}>
              {item}
            </span>
          ))
        ) : (
          <span className="text-sm font-semibold text-ink/50">None</span>
        )}
      </div>
    </div>
  );
}
