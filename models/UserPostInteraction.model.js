// models/userPostInteraction.model.js
import { Schema } from "mongoose";
import mongoose from "mongoose";

const UserPostInteractionSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    post: {
        type: Schema.Types.ObjectId,
        ref: "Post",
        required: true
    },
    liked: {
        type: Boolean,
        default: false
    },
    disliked: {
        type: Boolean,
        default: false
    },
    saved: {
        type: Boolean,
        default: false
    },
    viewed: {
        type: Boolean,
        default: false
    },
    viewedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Ensure one interaction record per user-post pair
UserPostInteractionSchema.index({ user: 1, post: 1 }, { unique: true });

export default mongoose.model("UserPostInteraction", UserPostInteractionSchema);