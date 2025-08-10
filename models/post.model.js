import {Schema} from "mongoose"
import mongoose from "mongoose" 

const PostSchema = new Schema({
        title: {
            type: String,
            required: true,
            trim: true
        },
        description: { 
            type: String,
            required: true
        },
        images: { 
            type: [String],
            default: []
        },
        videos: { 
            type: [String],
            default: []
        },
        tags: {
            type: [String],
            default: []
        },
        location: {
            type: String,
            trim: true
        },
        reactions: {
            likes: { type: Number, default: 0 },
            dislikes: { type: Number, default: 0 }
            // Removed shares and saves fields - we don't track these counts anymore
        },
        views: {
            type: Number,
            default: 0
        },
        isPinned: {
            type: Boolean,
            default: false
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    {timestamps: true}  
)

export default mongoose.model("Post", PostSchema);