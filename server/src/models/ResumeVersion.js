import mongoose from "mongoose";

const resumeVersionSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		internshipId: { type: mongoose.Schema.Types.ObjectId, ref: "Internship", required: true },
		content: { type: String, required: true, maxlength: 50000 },
		coverLetter: { type: String, trim: true, maxlength: 12000, default: "" },
		resumeBulletSuggestions: { type: [String], default: [] },
		applicationAnswers: {
			type: [{ question: { type: String, maxlength: 500 }, answer: { type: String, maxlength: 5000 } }],
			default: []
		},
		aiGenerated: { type: Boolean, default: false },
		aiProvider: { type: String, default: "Rule-based" },
		changeSummary: { type: [String], default: [] },
		matchedSkills: { type: [String], default: [] },
		missingSkills: { type: [String], default: [] },
		approved: { type: Boolean, default: false }
	},
	{ timestamps: true }
);

export const ResumeVersion = mongoose.model("ResumeVersion", resumeVersionSchema);
