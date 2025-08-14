// ===== 1. UPDATED UserPostInteraction Model =====
// models/UserPostInteraction.model.js
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
    lastInteraction: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Ensure unique combination of user and post
UserPostInteractionSchema.index({ user: 1, post: 1 }, { unique: true });

// Middleware to ensure user can't like and dislike at the same time
UserPostInteractionSchema.pre('save', function(next) {
    if (this.liked && this.disliked) {
        const error = new Error('Cannot like and dislike the same post simultaneously');
        return next(error);
    }
    this.lastInteraction = new Date();
    next();
});

export default mongoose.model("UserPostInteraction", UserPostInteractionSchema);