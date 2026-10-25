import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
		title: { type: String, required: true, trim: true, maxlength: 200 },
		message: { type: String, required: true, trim: true, maxlength: 2000 },
		read: { type: Boolean, default: false }
	},
	{ timestamps: true }
);

export const Notification = mongoose.model("Notification", notificationSchema);
