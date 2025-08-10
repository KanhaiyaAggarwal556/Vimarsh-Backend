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
        },
        dislikes: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true  // This adds createdAt and updatedAt automatically
})
CommentSchema.index({ post: 1, createdAt: -1 })  // Get comments for a post, newest first
CommentSchema.index({ user: 1, createdAt: -1 })  // Get comments by user, newest first

export default mongoose.model("Comment", CommentSchema);