import { generateResumeVariant } from "../agents/applicationPreparationAgent.js";
import { create, getAll, getById, getOne, updateById } from "../services/repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { textToPdf } from "../utils/pdf.js";

async function markApplicationPreparing(userId, internshipId) {
  const filter = { userId, internshipId };
  const existing = await getOne("applications", filter);
  if (!existing) {
    try {
      return await create("applications", { ...filter, status: "PREPARING" });
    } catch (error) {
      if (error.code !== 11000) throw error;
      return getOne("applications", filter);
    }
  }
  if (existing.status === "SAVED") return updateById("applications", existing._id, { status: "PREPARING" });
  return existing;
}

export const generateApplicationMaterial = asyncHandler(async (req, res) => {
  const internshipId = typeof req.body?.internshipId === "string" ? req.body.internshipId : "";
  if (!internshipId) throw httpError(400, "Choose an internship for your application materials.");
  const [profile, internship] = await Promise.all([
    getOne("profiles", { userId: req.user._id }),
    getById("internships", internshipId)
  ]);
  if (!profile?.resumeText) throw httpError(400, "Upload a readable resume before generating application materials.");
  if (!internship) throw httpError(404, "Internship not found.");
  const variant = await generateResumeVariant(profile, internship, req.user.name);
  const existing = await getOne("resumeVersions", { userId: req.user._id, internshipId });
  const resumeVersion = existing
    ? await updateById("resumeVersions", existing._id, { ...variant, approved: false })
    : await create("resumeVersions", { userId: req.user._id, internshipId, ...variant });
  const application = await markApplicationPreparing(req.user._id, internshipId);
  res.status(existing ? 200 : 201).json({ resumeVersion, application });
});

export const approveApplicationMaterial = asyncHandler(async (req, res) => {
  const id = req.body?.resumeVersionId;
  if (typeof id !== "string" || !id) throw httpError(400, "Choose a resume version to approve.");
  const version = await getOne("resumeVersions", { _id: id, userId: req.user._id });
  if (!version) throw httpError(404, "Resume version not found.");
  const resumeVersion = version.approved ? version : await updateById("resumeVersions", version._id, { approved: true });
  res.json({ resumeVersion });
});

export const updateApplicationMaterial = asyncHandler(async (req, res) => {
  const id = typeof req.body?.resumeVersionId === "string" ? req.body.resumeVersionId : req.params.id;
  if (!id) throw httpError(400, "Choose a resume version to update.");
  const version = await getOne("resumeVersions", { _id: id, userId: req.user._id });
  if (!version) throw httpError(404, "Resume version not found.");
  const update = {};
  if (req.body.content !== undefined) {
    if (typeof req.body.content !== "string" || req.body.content.trim().length < 20) {
      throw httpError(400, "Resume draft content is required.");
    }
    if (req.body.content.length > 50000) throw httpError(400, "Resume draft is too long.");
    update.content = req.body.content.trim();
  }
  if (req.body.coverLetter !== undefined) {
    if (typeof req.body.coverLetter !== "string") throw httpError(400, "Cover letter must be text.");
    if (req.body.coverLetter.length > 12000) throw httpError(400, "Cover letter is too long.");
    update.coverLetter = req.body.coverLetter.trim();
  }
  if (req.body.resumeBulletSuggestions !== undefined) {
    if (!Array.isArray(req.body.resumeBulletSuggestions)) {
      throw httpError(400, "Resume bullet suggestions must be a list.");
    }
    update.resumeBulletSuggestions = req.body.resumeBulletSuggestions
      .slice(0, 8)
      .map((item) => String(item || "").trim().slice(0, 1000))
      .filter(Boolean);
  }
  if (req.body.applicationAnswers !== undefined) {
    if (!Array.isArray(req.body.applicationAnswers)) throw httpError(400, "Application answers must be a list.");
    update.applicationAnswers = req.body.applicationAnswers.slice(0, 20).map((item) => ({
      question: String(item?.question || "").trim().slice(0, 300),
      answer: String(item?.answer || "").trim().slice(0, 4000)
    }));
  }
  if (!Object.keys(update).length) throw httpError(400, "Provide draft content to save.");
  update.approved = false;
  const resumeVersion = await updateById("resumeVersions", version._id, update);
  res.json({ resumeVersion });
});

export const listApplicationMaterials = asyncHandler(async (req, res) => {
  const resumeVersions = await getAll("resumeVersions", { userId: req.user._id }, { createdAt: -1 });
  res.json({ resumeVersions });
});

export const getApplicationMaterialPdf = asyncHandler(async (req, res) => {
  const version = await getOne("resumeVersions", { _id: req.params.id, userId: req.user._id });
  if (!version) throw httpError(404, "Resume version not found.");
  const internship = await getById("internships", version.internshipId);
  const safeTitle = String(internship?.title || "resume").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "resume";
  const pdf = textToPdf(version.content, { title: safeTitle });
  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.set({
    "Content-Type": "application/pdf",
    "Content-Length": String(pdf.length),
    "Content-Disposition": `${disposition}; filename="careerpilot-${safeTitle}.pdf"`
  });
  res.send(pdf);
});
