export function buildAnalytics({ applications, matches, internships, profile, resumeHistory = [] }) {
  const activeApplications = applications.filter((item) => !item.archived);
  const byStatus = Object.fromEntries(
    ["SAVED", "PREPARING", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"].map((status) => [
      status,
      activeApplications.filter((item) => item.status === status).length
    ])
  );
  const submitted = activeApplications.filter((item) =>
    ["APPLIED", "INTERVIEW", "OFFER", "REJECTED"].includes(item.status)
  );
  const interviews = activeApplications.filter((item) => ["INTERVIEW", "OFFER"].includes(item.status)).length;
  const offers = activeApplications.filter((item) => item.status === "OFFER").length;
  const rejected = activeApplications.filter((item) => item.status === "REJECTED").length;
  const responded = interviews + offers + rejected;
  const successful = activeApplications.filter((item) => ["INTERVIEW", "OFFER"].includes(item.status));
  const skillOutcomes = successful.length ? successful : submitted;
  const matchMap = new Map(matches.map((match) => [String(match.internshipId), match]));
  const skillCounts = new Map();
  for (const application of skillOutcomes) {
    const match = matchMap.get(String(application.internshipId));
    for (const skill of match?.matchedSkills || []) skillCounts.set(skill, (skillCounts.get(skill) || 0) + 1);
  }
  const requiredSkillCounts = new Map();
  for (const match of matches) {
    const internship = internships.find((item) => String(item._id) === String(match.internshipId));
    for (const skill of internship?.skillsRequired || match.matchedSkills || []) {
      requiredSkillCounts.set(skill, (requiredSkillCounts.get(skill) || 0) + 1);
    }
  }
  const appliedScores = submitted
    .map((application) => matchMap.get(String(application.internshipId))?.score)
    .filter(Number.isFinite);
  const missingFromResume = new Set(matches.flatMap((match) => match.missingSkills || []));
  const profileSkills = new Set((profile?.skills || []).map((skill) => skill.toLowerCase()));
  const strongSkills = (profile?.skills || []).slice(0, 10);
  const skillGaps = [...missingFromResume]
    .filter((skill) => !profileSkills.has(String(skill).toLowerCase()))
    .slice(0, 10)
    .map((skill) => {
      const progress = (profile?.skillProgress || []).find(
        (item) => item.skill.toLowerCase() === String(skill).toLowerCase()
      );
      return { skill, status: progress?.status || "not_started" };
    });

  const monthBuckets = new Map();
  for (const application of activeApplications) {
    const stamp = application.appliedAt || application.createdAt || application.updatedAt;
    if (!stamp) continue;
    const date = new Date(stamp);
    if (!Number.isFinite(date.getTime())) continue;
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    monthBuckets.set(key, (monthBuckets.get(key) || 0) + 1);
  }
  const progressOverTime = [...monthBuckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-6)
    .map(([month, count]) => ({ month, count }));

  const roleLabel = profile?.preferences?.roles?.length
    ? profile.preferences.roles.join(", ")
    : "your saved interests";
  const recommendationNote = activeApplications.length
    ? `You have ${activeApplications.length} tracked applications and ${matches.length} personalized recommendations for ${roleLabel}. ${
        missingFromResume.size
          ? `Consider building ${[...missingFromResume].slice(0, 3).join(", ")} to strengthen your fit.`
          : "Your current resume covers the listed skills in your recommendations."
      }`
    : profile?.resumeText
      ? `Your resume is ready. Review ${internships.length} available opportunities and save promising roles to start tracking outcomes.`
      : "Upload a resume to get personalized recommendations and begin your internship plan.";

  const hasEnoughResponseData = submitted.length >= 3;
  return {
    totalApplications: activeApplications.length,
    applicationsByStatus: byStatus,
    interviewCount: interviews,
    offerCount: offers,
    rejectedCount: rejected,
    interviewRate: submitted.length ? Math.round((interviews / submitted.length) * 100) : null,
    offerRate: submitted.length ? Math.round((offers / submitted.length) * 100) : null,
    responseRate: hasEnoughResponseData ? Math.round((responded / submitted.length) * 100) : null,
    responseRateAvailable: hasEnoughResponseData,
    matchScoreEffectiveness: appliedScores.length
      ? Math.round(appliedScores.reduce((sum, score) => sum + score, 0) / appliedScores.length)
      : null,
    topPerformingSkills: [...skillCounts]
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    frequentlyRequiredSkills: [...requiredSkillCounts]
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    strongSkills,
    skillGaps,
    progressOverTime,
    resumeAnalysisHistoryCount: resumeHistory.length,
    hasResumeAnalysis: Boolean(profile?.analysis && (profile.analysis.strengths?.length || profile.analysis.weaknesses?.length)),
    personalizedMatchCount: matches.filter((match) => match.score >= 70).length,
    recommendationNote
  };
}
