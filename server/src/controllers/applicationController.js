import { APPLICATION_STATUSES } from "../models/Application.js";
import { create, deleteById, getAll, getById, getOne, updateById } from "../services/repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";

const STATUS_RANK = { SAVED: 0, PREPARING: 1, APPLIED: 2, INTERVIEW: 3, OFFER: 4, REJECTED: 4 };
const STATUS_NOTIFICATION = {
  APPLIED: { title: "Application submitted", message: "Your application was marked as submitted." },
  INTERVIEW: { title: "Interview update", message: "You moved to the interview stage." },
  OFFER: { title: "Offer update", message: "Your application was marked as an offer." },
  REJECTED: { title: "Application update", message: "Your application was marked as rejected." }
};

function canTransition(current, next) {
  if (current === next) return true;
  if (current === "OFFER" || current === "REJECTED") return false;
  if (next === "REJECTED") return current === "APPLIED" || current === "INTERVIEW";
  return STATUS_RANK[next] >= STATUS_RANK[current];
}

async function notifyStatusChange(userId, internshipId, status) {
  const notification = STATUS_NOTIFICATION[status];
  if (!notification) return;
  const internship = await getById("internships", internshipId);
  await create("notifications", {
    userId,
    title: notification.title,
    message: `${internship?.title || "Your internship"}: ${notification.message}`,
    read: false
  });
}

async function enrichApplication(application) {
  const internship = await getById("internships", application.internshipId);
  return { ...application, internship };
}

async function enrichApplications(userId) {
  const applications = await getAll("applications", { userId }, { updatedAt: -1 });
  return Promise.all(applications.map(enrichApplication));
}

function requestedDate(value, fieldName) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw httpError(400, `${fieldName} must be a valid date.`);
  return date;
}

export const createApplication = asyncHandler(async (req, res) => {
  const internshipId = typeof req.body?.internshipId === "string" ? req.body.internshipId : "";
  if (!internshipId) throw httpError(400, "Choose an internship to track.");
  const internship = await getById("internships", internshipId);
  if (!internship) throw httpError(404, "Internship not found.");
  const status = req.body.status || "SAVED";
  if (!APPLICATION_STATUSES.includes(status)) throw httpError(400, "Choose a valid application status.");
  if (status === "APPLIED" && req.body.confirmedSubmitted !== true) {
    throw httpError(400, "Confirm that you submitted the application before marking it Applied.");
  }
  const notes = typeof req.body.notes === "string" ? req.body.notes.trim() : "";
  if (notes.length > 5000) throw httpError(400, "Notes must be 5,000 characters or fewer.");
  const interviewNotes = typeof req.body.interviewNotes === "string" ? req.body.interviewNotes.trim() : "";
  if (interviewNotes.length > 2000) throw httpError(400, "Interview notes must be 2,000 characters or fewer.");
  const nextActionDate = requestedDate(req.body.nextActionDate, "Next action date");
  const interviewDate = requestedDate(req.body.interviewDate, "Interview date");

  const filter = { userId: req.user._id, internshipId };
  const existing = await getOne("applications", filter);
  if (existing) {
    if (!canTransition(existing.status, status)) throw httpError(409, "Application status cannot move backwards.");
    const update = { status };
    if (req.body.notes !== undefined) update.notes = notes;
    if (req.body.interviewNotes !== undefined) update.interviewNotes = interviewNotes;
    if (nextActionDate !== undefined) update.nextActionDate = nextActionDate;
    if (interviewDate !== undefined) update.interviewDate = interviewDate;
    if (req.body.archived !== undefined) update.archived = Boolean(req.body.archived);
    if (status === "APPLIED" && !existing.appliedAt) update.appliedAt = new Date();
    const application = await updateById("applications", existing._id, update);
    if (existing.status !== status) await notifyStatusChange(req.user._id, internshipId, status);
    return res.json({ application: await enrichApplication(application) });
  }

  let application;
  try {
    application = await create("applications", {
      userId: req.user._id,
      internshipId,
      status,
      appliedAt: status === "APPLIED" ? new Date() : null,
      nextActionDate: nextActionDate ?? null,
      interviewDate: interviewDate ?? null,
      interviewNotes,
      archived: false,
      notes
    });
  } catch (error) {
    if (error.code === 11000) throw httpError(409, "This internship is already in your tracker.");
    throw error;
  }
  if (status === "SAVED") {
    await create("notifications", {
      userId: req.user._id,
      title: "Application saved",
      message: `${internship.title} was added to your tracker.`,
      read: false
    });
  } else {
    await notifyStatusChange(req.user._id, internshipId, status);
  }
  res.status(201).json({ application: await enrichApplication(application) });
});

export const getApplications = asyncHandler(async (req, res) => {
  res.json({ applications: await enrichApplications(req.user._id) });
});

export const updateApplication = asyncHandler(async (req, res) => {
  const application = await getOne("applications", { _id: req.params.id, userId: req.user._id });
  if (!application) throw httpError(404, "Application not found.");
  const body = req.body || {};
  const update = {};
  if (body.status !== undefined) {
    if (!APPLICATION_STATUSES.includes(body.status)) throw httpError(400, "Choose a valid application status.");
    if (!canTransition(application.status, body.status)) throw httpError(409, "Application status cannot move backwards.");
    if (body.status === "APPLIED" && application.status !== "APPLIED" && body.confirmedSubmitted !== true) {
      throw httpError(400, "Confirm that you submitted the application before marking it Applied.");
    }
    update.status = body.status;
    if (body.status === "APPLIED" && !application.appliedAt) update.appliedAt = new Date();
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== "string" || body.notes.length > 5000) throw httpError(400, "Notes must be 5,000 characters or fewer.");
    update.notes = body.notes.trim();
  }
  if (body.interviewNotes !== undefined) {
    if (typeof body.interviewNotes !== "string" || body.interviewNotes.length > 2000) {
      throw httpError(400, "Interview notes must be 2,000 characters or fewer.");
    }
    update.interviewNotes = body.interviewNotes.trim();
  }
  if (body.nextActionDate !== undefined) update.nextActionDate = requestedDate(body.nextActionDate, "Next action date");
  if (body.interviewDate !== undefined) update.interviewDate = requestedDate(body.interviewDate, "Interview date");
  if (body.archived !== undefined) update.archived = Boolean(body.archived);
  if (!Object.keys(update).length) {
    throw httpError(400, "Provide a status, notes, interview details, reminder, or archive flag to update.");
  }
  const updated = await updateById("applications", application._id, update);
  if (update.status && update.status !== application.status) await notifyStatusChange(req.user._id, application.internshipId, update.status);
  res.json({ application: await enrichApplication(updated) });
});

export const deleteApplication = asyncHandler(async (req, res) => {
  const application = await getOne("applications", { _id: req.params.id, userId: req.user._id });
  if (!application) throw httpError(404, "Application not found.");
  await deleteById("applications", application._id);
  res.json({ success: true, id: String(application._id) });
});
