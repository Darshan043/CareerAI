import { parseResume } from "../agents/profileAgent.js";
import { create, getAll, getById, getOne, upsert, updateById } from "../services/repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { parseListInput } from "../utils/text.js";

function clampString(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseStringList(value, { maxItems = 40, maxLength = 500 } = {}) {
  const items = Array.isArray(value)
    ? value.map((item) => clampString(String(item || ""), maxLength)).filter(Boolean)
    : parseListInput(value).map((item) => item.slice(0, maxLength));
  if (items.length > maxItems) throw httpError(400, `Enter up to ${maxItems} items.`);
  return items;
}

function isHttpUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function computeProfileCompleteness(profile, user = {}) {
  const checks = [
    Boolean(user.name || profile?.headline),
    Boolean(user.email),
    Boolean(profile?.phone),
    Boolean(profile?.location || profile?.preferences?.location),
    Boolean(profile?.portfolioUrl || profile?.githubUrl || profile?.linkedinUrl),
    Boolean(profile?.resumeText),
    (profile?.skills || []).length > 0,
    (profile?.education || []).length > 0,
    (profile?.projects || []).length > 0 || (profile?.experience || []).length > 0,
    (profile?.preferences?.roles || []).length > 0
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

async function loadUser(userId) {
  return getById("users", userId);
}

export const getProfile = asyncHandler(async (req, res) => {
  const profile = await upsert("profiles", { userId: req.user._id }, { userId: req.user._id });
  const user = await loadUser(req.user._id);
  res.json({
    profile,
    user: { name: user?.name || req.user.name, email: user?.email || req.user.email },
    completeness: computeProfileCompleteness(profile, user || req.user)
  });
});

async function archivePreviousResume(userId, previousProfile) {
  if (!previousProfile?.resumeText) return;
  const matches = await getAll("matches", { userId }, { score: -1 });
  const topMatches = [];
  for (const match of matches.slice(0, 3)) {
    const internship = await getById("internships", match.internshipId);
    if (internship) topMatches.push({ title: internship.title, company: internship.company, score: match.score });
  }
  const resumeVersionCount = (await getAll("resumeVersions", { userId })).length;
  await create("resumeHistory", {
    userId,
    label: "Previous resume",
    skills: previousProfile.skills || [],
    summary: previousProfile.resumeSummary || previousProfile.resumeText.slice(0, 1000),
    topMatches,
    matchCount: matches.length,
    highMatchCount: matches.filter((match) => match.score >= 80).length,
    resumeVersionCount,
    supersededAt: new Date()
  });
}

export const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) throw httpError(400, "Upload a PDF resume file.");
  const previous = await getOne("profiles", { userId: req.user._id });
  let parsed;
  try {
    if (req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw httpError(422, "This file is not a valid PDF. Upload a readable PDF resume.");
    }
    parsed = await parseResume(req.file.buffer, { roles: previous?.preferences?.roles || [] });
  } catch (error) {
    if (error.expose) throw error;
    throw httpError(422, "This PDF could not be read. Upload a text based PDF resume.");
  }
  if (!parsed.resumeText) throw httpError(422, "No readable resume text was found. Your existing profile was kept.");

  await archivePreviousResume(req.user._id, previous);
  const update = {
    skills: parsed.skills,
    projects: parsed.projects,
    experience: parsed.experience,
    education: parsed.education,
    resumeSummary: parsed.summary,
    analysis: parsed.analysis,
    resumeText: parsed.resumeText,
    embedding: parsed.embedding
  };
  const profile = previous
    ? await updateById("profiles", previous._id, update)
    : await upsert("profiles", { userId: req.user._id }, { userId: req.user._id, ...update }, update);
  const user = await loadUser(req.user._id);
  res.json({
    profile,
    summary: parsed.summary,
    pipelineReset: false,
    completeness: computeProfileCompleteness(profile, user || req.user)
  });
});

export const getResumeHistory = asyncHandler(async (req, res) => {
  const history = await getAll("resumeHistory", { userId: req.user._id }, { supersededAt: -1, createdAt: -1 });
  res.json({ history });
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const roles = parseListInput(body.roles);
  const location = clampString(body.location, 160);
  const workMode = clampString(body.workMode, 40);
  const stipendRange = clampString(body.stipendRange, 120);
  const availability = clampString(body.availability, 160);
  if (roles.length > 30 || roles.some((role) => role.length > 80)) throw httpError(400, "Enter up to 30 roles, each 80 characters or fewer.");
  if (!["", "Remote", "Hybrid", "On-site"].includes(workMode)) throw httpError(400, "Choose a valid work mode.");
  const preferences = { roles, location, workMode, stipendRange, availability };
  const profile = await upsert(
    "profiles",
    { userId: req.user._id },
    { userId: req.user._id, preferences },
    { preferences }
  );
  res.json({ profile, completeness: computeProfileCompleteness(profile, req.user) });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const existing = await upsert("profiles", { userId: req.user._id }, { userId: req.user._id });
  const update = {};

  if (body.name !== undefined) {
    const name = clampString(body.name, 120);
    if (name.length < 1) throw httpError(400, "Name is required.");
    await updateById("users", req.user._id, { name });
    req.user.name = name;
  }

  for (const field of ["headline", "phone", "location", "portfolioUrl", "githubUrl", "linkedinUrl"]) {
    if (body[field] === undefined) continue;
    const max = field.endsWith("Url") ? 300 : field === "headline" ? 200 : field === "phone" ? 40 : 160;
    const value = clampString(body[field], max);
    if (field.endsWith("Url") && !isHttpUrl(value)) throw httpError(400, `${field} must be an http(s) URL.`);
    update[field] = value;
  }

  if (body.skills !== undefined) update.skills = parseStringList(body.skills, { maxItems: 60, maxLength: 80 });
  if (body.projects !== undefined) update.projects = parseStringList(body.projects, { maxItems: 30, maxLength: 500 });
  if (body.experience !== undefined) update.experience = parseStringList(body.experience, { maxItems: 30, maxLength: 500 });
  if (body.education !== undefined) update.education = parseStringList(body.education, { maxItems: 20, maxLength: 500 });
  if (body.resumeSummary !== undefined) update.resumeSummary = clampString(body.resumeSummary, 5000);

  if (body.applyExtracted === true && existing.analysis) {
    if (!update.skills?.length && existing.skills?.length) update.skills = existing.skills;
  }

  if (!Object.keys(update).length && body.name === undefined) {
    throw httpError(400, "Provide profile fields to update.");
  }

  const profile = Object.keys(update).length
    ? await updateById("profiles", existing._id, update)
    : existing;
  const user = await loadUser(req.user._id);
  res.json({
    profile,
    user: { name: user?.name || req.user.name, email: user?.email || req.user.email },
    completeness: computeProfileCompleteness(profile, user || req.user)
  });
});

export const updateSkillProgress = asyncHandler(async (req, res) => {
  const skill = clampString(req.body?.skill, 80);
  const status = clampString(req.body?.status, 20);
  if (!skill) throw httpError(400, "Choose a skill to update.");
  if (!["not_started", "started", "completed"].includes(status)) {
    throw httpError(400, "Skill status must be not_started, started, or completed.");
  }
  const profile = await upsert("profiles", { userId: req.user._id }, { userId: req.user._id });
  const progress = Array.isArray(profile.skillProgress) ? [...profile.skillProgress] : [];
  const index = progress.findIndex((item) => item.skill.toLowerCase() === skill.toLowerCase());
  const entry = { skill, status, updatedAt: new Date() };
  if (index >= 0) progress[index] = entry;
  else progress.push(entry);
  const updated = await updateById("profiles", profile._id, { skillProgress: progress });
  res.json({ profile: updated, skillProgress: updated.skillProgress });
});
