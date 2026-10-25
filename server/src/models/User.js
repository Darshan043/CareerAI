import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
		email: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
			maxlength: 254,
			match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
			unique: true
		},
		password: { type: String, required: true, minlength: 8, select: false }
	},
	{ timestamps: true, collection: "users" }
);

export const User = mongoose.model("User", userSchema);
