import mongoose from "mongoose";

const skillProgressSchema = new mongoose.Schema(
	{
		skill: { type: String, trim: true, maxlength: 80, required: true },
		status: { type: String, enum: ["not_started", "started", "completed"], default: "not_started" },
		updatedAt: { type: Date, default: Date.now }
	},
	{ _id: false }
);

const profileSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
		headline: { type: String, trim: true, maxlength: 200, default: "" },
		phone: { type: String, trim: true, maxlength: 40, default: "" },
		location: { type: String, trim: true, maxlength: 160, default: "" },
		portfolioUrl: { type: String, trim: true, maxlength: 300, default: "" },
		githubUrl: { type: String, trim: true, maxlength: 300, default: "" },
		linkedinUrl: { type: String, trim: true, maxlength: 300, default: "" },
		skills: { type: [String], default: [] },
		projects: { type: [String], default: [] },
		experience: { type: [String], default: [] },
		education: { type: [String], default: [] },
		skillProgress: { type: [skillProgressSchema], default: [] },
		resumeSummary: { type: String, trim: true, maxlength: 5000, default: "" },
		analysis: {
			strengths: { type: [String], default: [] },
			weaknesses: { type: [String], default: [] },
			missingSkills: { type: [String], default: [] },
			aiGenerated: { type: Boolean, default: false },
			aiProvider: { type: String, default: "Rule-based" }
		},
		preferences: {
			roles: { type: [String], default: [] },
			location: { type: String, trim: true, maxlength: 160, default: "" },
			workMode: { type: String, enum: ["", "Remote", "Hybrid", "On-site"], default: "" },
			stipendRange: { type: String, trim: true, maxlength: 120, default: "" },
			availability: { type: String, trim: true, maxlength: 160, default: "" }
		},
		resumeText: { type: String, default: "" },
		embedding: { type: [Number], default: [] }
	},
	{ timestamps: true }
);

export const Profile = mongoose.model("Profile", profileSchema);
