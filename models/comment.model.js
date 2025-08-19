import { Schema } from "mongoose"
import mongoose from "mongoose"

const CommentSchema = new Schema({
    body: {  
        type: String,
        required: true,
        trim: true
    },
    post: {
        type: Schema.Types.ObjectId,  
        ref: "Post",
        required: true
    },
    user: {
        type: Schema.Types.ObjectId,  
        ref: "User",
        required: true
    },
    reactions: {
        likes: {
            type: Number,
            default: 0,
            min: 0
        }
        // Removed dislikes section
    },
    // Store user IDs who liked this comment for persistence
    likedBy: [{
        type: Schema.Types.ObjectId,
        ref: "User"
    }],
    
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true  // This adds createdAt and updatedAt automatically
})

// Indexes for better performance
CommentSchema.index({ post: 1, createdAt: -1 })  // Get comments for a post, newest first
CommentSchema.index({ user: 1, createdAt: -1 })  // Get comments by user, newest first
CommentSchema.index({ likedBy: 1 }) // For checking user likes

export default mongoose.model("Comment", CommentSchema);