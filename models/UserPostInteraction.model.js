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
    shared: {
        type: Boolean,
        default: false
    },
    // Optimized view tracking fields
    viewCount: {
        type: Number,
        default: 0
    },
    firstViewedAt: {
        type: Date
    },
    lastViewAt: {
        type: Date
    },
    totalViewDuration: {
        type: Number,
        default: 0 // in seconds
    },
    referralSource: {
        type: String,
        enum: ['direct', 'feed', 'search', 'profile', 'notification', 'share'],
        default: 'direct'
    },
    lastInteraction: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// FIXED: Essential indexes for performance
UserPostInteractionSchema.index({ user: 1, post: 1 }, { unique: true });
UserPostInteractionSchema.index({ post: 1, viewed: 1 });
UserPostInteractionSchema.index({ user: 1, viewed: 1 });
UserPostInteractionSchema.index({ lastViewAt: -1 });
// NEW: Index for analytics queries
UserPostInteractionSchema.index({ post: 1, createdAt: -1 });

// Pre-save middleware for validation
UserPostInteractionSchema.pre('save', function(next) {
    // Ensure like and dislike are mutually exclusive
    if (this.liked && this.disliked) {
        const error = new Error('Cannot like and dislike the same post simultaneously');
        return next(error);
    }
    
    // Update last interaction timestamp
    this.lastInteraction = new Date();
    
    // If viewed is being set to true for first time, set firstViewedAt
    if (this.viewed && !this.firstViewedAt) {
        this.firstViewedAt = new Date();
        this.lastViewAt = new Date();
    }
    
    // Update lastViewAt if viewed is true
    if (this.viewed) {
        this.lastViewAt = new Date();
    }
    
    next();
});

// Virtual for engagement score (calculated on demand)
UserPostInteractionSchema.virtual('engagementScore').get(function() {
    let score = 0;
    if (this.viewed) score += 1;
    if (this.liked) score += 3;
    if (this.disliked) score += 2;
    if (this.saved) score += 4;
    if (this.shared) score += 5;
    if (this.totalViewDuration > 30) score += 2;
    if (this.viewCount > 1) score += Math.min(this.viewCount - 1, 3);
    return score;
});

// Static method to find interactions by post with analytics
UserPostInteractionSchema.statics.getPostAnalytics = async function(postId) {
    return this.aggregate([
        { $match: { post: new mongoose.Types.ObjectId(postId) } },
        {
            $group: {
                _id: null,
                totalInteractions: { $sum: 1 },
                uniqueViewers: { $sum: { $cond: ["$viewed", 1, 0] } },
                totalLikes: { $sum: { $cond: ["$liked", 1, 0] } },
                totalDislikes: { $sum: { $cond: ["$disliked", 1, 0] } },
                totalSaves: { $sum: { $cond: ["$saved", 1, 0] } },
                avgViewDuration: { 
                    $avg: { 
                        $cond: [
                            { $gt: ["$totalViewDuration", 0] }, 
                            "$totalViewDuration", 
                            null
                        ] 
                    } 
                }
            }
        }
    ]);
};

export default mongoose.model("UserPostInteraction", UserPostInteractionSchema);