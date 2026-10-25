import mongoose from "mongoose";

export const APPLICATION_STATUSES = ["SAVED", "PREPARING", "APPLIED", "INTERVIEW", "OFFER", "REJECTED"];

const applicationSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		internshipId: { type: mongoose.Schema.Types.ObjectId, ref: "Internship", required: true },
		status: { type: String, enum: APPLICATION_STATUSES, default: "SAVED", required: true },
		appliedAt: { type: Date, default: null },
		nextActionDate: { type: Date, default: null },
		interviewDate: { type: Date, default: null },
		interviewNotes: { type: String, trim: true, maxlength: 2000, default: "" },
		archived: { type: Boolean, default: false },
		notes: { type: String, trim: true, maxlength: 5000, default: "" }
	},
	{ timestamps: true }
);

applicationSchema.index({ userId: 1, internshipId: 1 }, { unique: true });

export const Application = mongoose.model("Application", applicationSchema);
