import {Schema} from "mongoose"
import mongoose from "mongoose"

const BoardSchema = new Schema({
    coverPhoto: {
        type: String,
        trim: true
    },
    bio: {
        type: String,
    },
    website: {
        type: String,
        lowercase: true
    },
    socialStats: {
        followers: { type: Number, default: 0 }, // Keep count for quick access
        following: { type: Number, default: 0 }, // Keep count for quick access
        posts: { type: Number, default: 0 },
        likes: { type: Number, default: 0 }
    },
    // New arrays to store actual follower/following data
    followers: [{
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        followedAt: {
            type: Date,
            default: Date.now
        }
    }],
    following: [{
        user: {
            type: Schema.Types.ObjectId,
            ref: "User", 
            required: true
        },
        followedAt: {
            type: Date,
            default: Date.now
        }
    }],
    interests: {
        type: [String]  
    }, 
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    bookmarks: [{
        type: Schema.Types.ObjectId,
        ref: "Post"
    }],
    location: {
        type: String,
        trim: true
    }
}, 
{timestamps: true})

export default mongoose.models.Board || mongoose.model("Board", BoardSchema);