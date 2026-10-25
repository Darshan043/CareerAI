import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
		internshipId: { type: mongoose.Schema.Types.ObjectId, ref: "Internship", required: true },
		score: { type: Number, min: 0, max: 100, required: true },
		scoreBreakdown: {
			skills: { type: Number, min: 0, max: 80, default: 0 },
			role: { type: Number, min: 0, max: 10, default: 0 },
			location: { type: Number, min: 0, max: 10, default: 0 }
		},
		matchedSkills: { type: [String], default: [] },
		missingSkills: { type: [String], default: [] },
		reason: { type: String, default: "", maxlength: 2000 }
	},
	{ timestamps: true }
);

matchSchema.index({ userId: 1, internshipId: 1 }, { unique: true });

export const Match = mongoose.model("Match", matchSchema);
