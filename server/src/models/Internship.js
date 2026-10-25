import mongoose from "mongoose";

const internshipSchema = new mongoose.Schema(
	{
		title: { type: String, required: true, trim: true, maxlength: 200 },
		company: { type: String, required: true, trim: true, maxlength: 200 },
		description: { type: String, default: "", maxlength: 20000 },
		skillsRequired: { type: [String], default: [] },
		location: { type: String, trim: true, maxlength: 200, default: "Remote" },
		country: { type: String, trim: true, maxlength: 100, default: "" },
		employmentType: { type: String, trim: true, maxlength: 80, default: "" },
		salary: { type: String, trim: true, maxlength: 120, default: "" },
		employerWebsite: { type: String, trim: true, maxlength: 2048, default: "" },
		employerLogo: { type: String, trim: true, maxlength: 2048, default: "" },
		publisher: { type: String, trim: true, maxlength: 120, default: "" },
		externalId: { type: String, trim: true, maxlength: 200, default: "" },
		remote: { type: Boolean, default: false },
		applyLink: { type: String, required: true, trim: true, maxlength: 2048 },
		applicationLinkType: { type: String, enum: ["direct", "platform"], default: "platform" },
		source: { type: String, trim: true, maxlength: 120, default: "Unknown" },
		isSample: { type: Boolean, default: false },
		deadline: { type: Date, default: null },
		expiresAt: { type: Date, default: null },
		postedDate: { type: Date, default: Date.now },
		embedding: { type: [Number], default: [] }
	},
	{ timestamps: true }
);

internshipSchema.index({ company: 1, title: 1, applyLink: 1 }, { unique: true });

export const Internship = mongoose.model("Internship", internshipSchema);
