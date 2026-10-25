import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { profileApi } from "../api/queries";
import { Button } from "./Button";
import { ErrorBanner } from "./ErrorBanner";
import { inputClass } from "./Field";

const MAX_BYTES = 5 * 1024 * 1024;

export function ResumeUploadCard({ profile }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState(null);
  const [notice, setNotice] = useState("");
  const [localError, setLocalError] = useState("");
  const [showAnalysis, setShowAnalysis] = useState(Boolean(profile?.analysis));
  const fileInput = useRef(null);

  const uploadMutation = useMutation({
    mutationFn: profileApi.uploadResume,
    onSuccess: async (result) => {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setShowAnalysis(true);
      setNotice(
        result.pipelineReset
          ? "Resume uploaded. Your matching results have been refreshed."
          : "Resume uploaded and analyzed. Review the results below, then regenerate matches in Explorer."
      );
      await Promise.all(
        [
          "profile",
          "profile-history",
          "internships",
          "matches",
          "resume-versions",
          "applications",
          "notifications",
          "analytics"
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] }))
      );
    }
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      profileApi.update({
        skills: profile?.skills || [],
        projects: profile?.projects || [],
        experience: profile?.experience || [],
        education: profile?.education || [],
        resumeSummary: profile?.resumeSummary || "",
        applyExtracted: true
      }),
    onSuccess: async () => {
      setNotice("Profile sections confirmed from the latest resume analysis.");
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
  });

  const hasResume = Boolean(profile?.resumeText);

  const validateAndSetFile = (next) => {
    setNotice("");
    setLocalError("");
    if (!next) {
      setFile(null);
      return;
    }
    if (next.type !== "application/pdf") {
      setLocalError("Only PDF resumes are supported.");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (next.size > MAX_BYTES) {
      setLocalError("Resume must be 5 MB or smaller.");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setFile(next);
  };

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-ink">AI Resume Analyzer</h2>
          <p className="text-sm font-semibold text-ink/55">
            {hasResume
              ? "Upload a replacement PDF to re-analyze. Prior resumes stay in history."
              : "Upload a PDF resume to extract skills, strengths, and gaps."}
          </p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-md bg-moss/10 text-moss">
          <FileCheck2 className="h-5 w-5" />
        </div>
      </div>

      <ErrorBanner error={uploadMutation.error || applyMutation.error || (localError ? { message: localError } : null)} />
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <input
          ref={fileInput}
          className={inputClass}
          type="file"
          accept="application/pdf"
          onChange={(event) => validateAndSetFile(event.target.files?.[0] || null)}
        />
        <Button
          icon={Upload}
          loading={uploadMutation.isPending}
          disabled={!file}
          onClick={() => {
            setNotice("");
            if (file) uploadMutation.mutate(file);
          }}
        >
          {hasResume ? "Replace Resume" : "Upload Resume"}
        </Button>
        <Button
          variant="secondary"
          icon={Sparkles}
          disabled={!hasResume}
          onClick={() => setShowAnalysis(true)}
        >
          View Detailed Results
        </Button>
      </div>

      {notice ? (
        <p className="mt-3 rounded-md bg-moss/10 px-3 py-2 text-sm font-bold text-moss">{notice}</p>
      ) : null}

      <div className="mt-5">
        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-ink/45">Extracted Skills</h3>
        <div className="mt-3 flex min-h-10 flex-wrap gap-2">
          {(profile?.skills || []).length ? (
            profile.skills.slice(0, 16).map((skill) => (
              <span key={skill} className="rounded-full bg-moss/10 px-3 py-1 text-xs font-black text-moss">
                {skill}
              </span>
            ))
          ) : (
            <p className="text-sm font-semibold text-ink/55">No resume skills extracted yet.</p>
          )}
        </div>
      </div>

      {profile?.resumeSummary ? (
        <p className="mt-5 rounded-md bg-paper p-4 text-sm font-semibold leading-6 text-ink/65">
          {profile.resumeSummary}
        </p>
      ) : null}

      {showAnalysis && profile?.analysis ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <p className="sm:col-span-2 text-xs font-semibold text-ink/45">
            {profile.analysis.aiGenerated
              ? `${profile.analysis.aiProvider || "AI"}-assisted analysis; verify every detail against your resume.`
              : "Rule-based analysis; AI analysis was not available for this upload."}
          </p>
          <AnalysisList title="Resume strengths" items={profile.analysis.strengths} tone="moss" />
          <AnalysisList title="Ways to improve" items={profile.analysis.weaknesses} tone="gold" />
          {profile.analysis.missingSkills?.length ? (
            <div className="sm:col-span-2">
              <AnalysisList title="Skill gaps for your interests" items={profile.analysis.missingSkills} tone="coral" />
            </div>
          ) : null}
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={applyMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Confirm using the extracted skills, education, projects, and experience on your profile? Review them first — AI can miss or misread details."
                  )
                ) {
                  applyMutation.mutate();
                }
              }}
            >
              Update Profile from Extracted Details
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AnalysisList({ title, items = [], tone }) {
  const color = tone === "moss" ? "text-moss" : tone === "coral" ? "text-coral" : "text-gold";
  return (
    <div className="rounded-md border border-ink/10 bg-white p-3">
      <h3 className={`text-xs font-black uppercase tracking-[0.12em] ${color}`}>{title}</h3>
      <ul className="mt-2 grid gap-2 text-sm font-semibold text-ink/65">
        {items.length ? items.map((item) => <li key={item}>{item}</li>) : <li>None identified</li>}
      </ul>
    </div>
  );
}
