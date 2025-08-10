// Updated user.model.js with OAuth fields and missing fields
import { Schema } from "mongoose";
import mongoose from "mongoose";

const UserSchema = new Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    userName: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    hashedPassword: {
        type: String,
        required: true
    },
    profilepic: {
        type: String,
        trim: true,
        default: ''
    },
    // OAuth provider IDs
    googleId: {
        type: String,
        sparse: true,
        index: true
    },
    facebookId: {
        type: String,
        sparse: true,
        index: true
    },
    linkedinId: {
        type: String,
        sparse: true,
        index: true
    },
    twitterId: {
        type: String,
        sparse: true,
        index: true
    },

}, {
    timestamps: true
});

// Remove duplicate indexes - they're already defined in the schema fields
// Add compound indexes for better query performance
UserSchema.index({ email: 1, userName: 1 });
UserSchema.index({ userName: 1, email: 1 });

export default mongoose.model("User", UserSchema);