import mongoose from "mongoose";

// A point-in-time snapshot of a previously uploaded resume and the results it produced.
const resumeHistorySchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
		label: { type: String, trim: true, maxlength: 240, default: "Previous resume" },
		skills: { type: [String], default: [] },
		summary: { type: String, default: "", maxlength: 5000 },
		topMatches: {
			type: [{ title: String, company: String, score: { type: Number, min: 0, max: 100 } }],
			default: []
		},
		matchCount: { type: Number, min: 0, default: 0 },
		highMatchCount: { type: Number, min: 0, default: 0 },
		resumeVersionCount: { type: Number, min: 0, default: 0 },
		supersededAt: { type: Date, default: Date.now }
	},
	{ timestamps: true }
);

export const ResumeHistory = mongoose.model("ResumeHistory", resumeHistorySchema);
