import Post from "../models/post.model.js";
import UserPostInteraction from "../models/UserPostInteraction.model.js";
import mongoose from "mongoose";

// FIXED: Simple in-memory rate limiting
const rateLimitMap = new Map();

// FIXED: In-memory cache for recent views (5 minutes)
const recentViews = new Map();
const DUPLICATE_VIEW_WINDOW = 5 * 60 * 1000;

// FIXED: Cleanup cache periodically
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    
    // Clean rate limit map
    for (const [key, data] of rateLimitMap.entries()) {
        if (now > data.resetTime) {
            rateLimitMap.delete(key);
        }
    }
    
    // Clean view tracking cache
    for (const [key, timestamp] of recentViews.entries()) {
        if (now - timestamp > DUPLICATE_VIEW_WINDOW) {
            recentViews.delete(key);
        }
    }
}, 60000);

// Export cleanup function for testing
export const cleanupMemory = () => {
    clearInterval(cleanupInterval);
    rateLimitMap.clear();
    recentViews.clear();
};

export const toggleLike = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const post = await Post.findById(postId).session(session);
            if (!post) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: "Post not found"
                });
            }

            let interaction = await UserPostInteraction.findOne({
                user: userId,
                post: postId
            }).session(session);

            let wasLiked = false;
            let wasDisliked = false;
            let newLikeState = false;
            let postUpdate = {};

            if (!interaction) {
                interaction = new UserPostInteraction({
                    user: userId,
                    post: postId,
                    liked: true,
                    disliked: false
                });
                newLikeState = true;
                postUpdate = { $inc: { "reactions.likes": 1 } };
            } else {
                wasLiked = interaction.liked;
                wasDisliked = interaction.disliked;

                if (wasLiked) {
                    interaction.liked = false;
                    newLikeState = false;
                    postUpdate = { $inc: { "reactions.likes": -1 } };
                } else {
                    interaction.liked = true;
                    newLikeState = true;
                    
                    if (wasDisliked) {
                        interaction.disliked = false;
                        postUpdate = { 
                            $inc: { 
                                "reactions.likes": 1,
                                "reactions.dislikes": -1 
                            } 
                        };
                    } else {
                        postUpdate = { $inc: { "reactions.likes": 1 } };
                    }
                }
            }

            await interaction.save({ session });
            const updatedPost = await Post.findByIdAndUpdate(
                postId,
                postUpdate,
                { session, new: true }
            ).populate('user', 'userName fullName profilePic');

            await session.commitTransaction();

            res.status(200).json({
                success: true,
                message: newLikeState ? "Post liked successfully" : "Like removed successfully",
                data: {
                    liked: newLikeState,
                    disliked: interaction.disliked,
                    post: {
                        _id: updatedPost._id,
                        likes: updatedPost.reactions.likes,
                        dislikes: updatedPost.reactions.dislikes
                    }
                }
            });

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error("Toggle like error:", error);
        res.status(500).json({
            success: false,
            message: "Error processing like action",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const toggleDislike = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const post = await Post.findById(postId).session(session);
            if (!post) {
                await session.abortTransaction();
                return res.status(404).json({
                    success: false,
                    message: "Post not found"
                });
            }

            let interaction = await UserPostInteraction.findOne({
                user: userId,
                post: postId
            }).session(session);

            let wasLiked = false;
            let wasDisliked = false;
            let newDislikeState = false;
            let postUpdate = {};

            if (!interaction) {
                interaction = new UserPostInteraction({
                    user: userId,
                    post: postId,
                    liked: false,
                    disliked: true
                });
                newDislikeState = true;
                postUpdate = { $inc: { "reactions.dislikes": 1 } };
            } else {
                wasLiked = interaction.liked;
                wasDisliked = interaction.disliked;

                if (wasDisliked) {
                    interaction.disliked = false;
                    newDislikeState = false;
                    postUpdate = { $inc: { "reactions.dislikes": -1 } };
                } else {
                    interaction.disliked = true;
                    newDislikeState = true;
                    
                    if (wasLiked) {
                        interaction.liked = false;
                        postUpdate = { 
                            $inc: { 
                                "reactions.dislikes": 1,
                                "reactions.likes": -1 
                            } 
                        };
                    } else {
                        postUpdate = { $inc: { "reactions.dislikes": 1 } };
                    }
                }
            }

            await interaction.save({ session });
            const updatedPost = await Post.findByIdAndUpdate(
                postId,
                postUpdate,
                { session, new: true }
            ).populate('user', 'userName fullName profilePic');

            await session.commitTransaction();

            res.status(200).json({
                success: true,
                message: newDislikeState ? "Post disliked successfully" : "Dislike removed successfully",
                data: {
                    liked: interaction.liked,
                    disliked: newDislikeState,
                    post: {
                        _id: updatedPost._id,
                        likes: updatedPost.reactions.likes,
                        dislikes: updatedPost.reactions.dislikes
                    }
                }
            });

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error("Toggle dislike error:", error);
        res.status(500).json({
            success: false,
            message: "Error processing dislike action",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// FIXED: Simplified and robust view tracking
export const trackPostView = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.userId;
        const { viewDuration = 0, referralSource = 'direct' } = req.body;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        // Check if post exists and get author
        const post = await Post.findById(postId, 'user views');
        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found"
            });
        }

        // Don't count self-views
        if (post.user.toString() === userId) {
            return res.status(200).json({
                success: true,
                message: "Self-view not counted",
                data: { 
                    viewAdded: false, 
                    totalViews: post.views,
                    userViewCount: 0,
                    reason: 'self-view'
                }
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find existing interaction
            let interaction = await UserPostInteraction.findOne({
                user: userId,
                post: postId
            }).session(session);

            let shouldIncrementView = false;
            let userViewCount = 0;

            if (!interaction) {
                // FIRST TIME: Create new interaction and increment view
                interaction = new UserPostInteraction({
                    user: userId,
                    post: postId,
                    viewed: true,
                    viewCount: 1,
                    firstViewedAt: new Date(),
                    lastViewAt: new Date(),
                    totalViewDuration: viewDuration,
                    referralSource
                });
                shouldIncrementView = true;
                userViewCount = 1;
            } else if (!interaction.viewed) {
                // PREVIOUSLY INTERACTED BUT NEVER VIEWED: Mark as viewed and increment
                interaction.viewed = true;
                interaction.viewCount = 1;
                interaction.firstViewedAt = new Date();
                interaction.lastViewAt = new Date();
                interaction.totalViewDuration = (interaction.totalViewDuration || 0) + viewDuration;
                shouldIncrementView = true;
                userViewCount = 1;
            } else {
                // ALREADY VIEWED: Don't increment, just update engagement
                interaction.lastViewAt = new Date();
                interaction.totalViewDuration = (interaction.totalViewDuration || 0) + viewDuration;
                userViewCount = interaction.viewCount;
                shouldIncrementView = false;
            }

            await interaction.save({ session });

            // Only increment post view count for first-time views
            let updatedPost;
            if (shouldIncrementView) {
                updatedPost = await Post.findByIdAndUpdate(
                    postId,
                    { $inc: { views: 1 } },
                    { session, new: true, select: 'views' }
                );
                
                console.log(`✅ NEW VIEW: User ${userId} -> Post ${postId}. Total: ${updatedPost.views}`);
            } else {
                updatedPost = await Post.findById(postId, 'views').session(session);
                console.log(`ℹ️ REPEAT VIEW: User ${userId} -> Post ${postId}. Total unchanged: ${updatedPost.views}`);
            }

            await session.commitTransaction();

            res.status(200).json({
                success: true,
                message: shouldIncrementView ? "View tracked successfully" : "Engagement updated",
                data: {
                    viewAdded: shouldIncrementView,
                    totalViews: updatedPost.views,
                    userViewCount: userViewCount,
                    reason: shouldIncrementView ? 'first-view' : 'repeat-view'
                }
            });

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error("Track view error:", error);
        res.status(500).json({
            success: false,
            message: "Error tracking post view",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// FIXED: Rate limiting middleware
export const viewTrackingRateLimit = (req, res, next) => {
    const userId = req.userId;
    const now = Date.now();
    
    if (!userId) return next();
    
    const rateLimitKey = `rate-${userId}`;
    const userActivity = rateLimitMap.get(rateLimitKey);
    
    if (!userActivity || now > userActivity.resetTime) {
        rateLimitMap.set(rateLimitKey, {
            count: 1,
            resetTime: now + 60000 // 1 minute window
        });
        return next();
    }
    
    if (userActivity.count >= 30) {
        return res.status(429).json({
            success: false,
            message: "Too many requests. Please slow down.",
            retryAfter: Math.ceil((userActivity.resetTime - now) / 1000)
        });
    }
    
    userActivity.count++;
    next();
};

export const getUserPostInteraction = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        const interaction = await UserPostInteraction.findOne({
            user: userId,
            post: postId
        }, 'liked disliked saved viewed viewCount totalViewDuration');

        res.status(200).json({
            success: true,
            data: interaction ? {
                liked: interaction.liked,
                disliked: interaction.disliked,
                saved: interaction.saved,
                viewed: interaction.viewed,
                viewCount: interaction.viewCount,
                totalViewDuration: interaction.totalViewDuration
            } : {
                liked: false,
                disliked: false,
                saved: false,
                viewed: false,
                viewCount: 0,
                totalViewDuration: 0
            }
        });

    } catch (error) {
        console.error("Get user post interaction error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching user interaction",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const trackMultiplePostViews = async (req, res) => {
    try {
        const { postViews } = req.body;
        const userId = req.userId;

        if (!Array.isArray(postViews) || postViews.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid post views data"
            });
        }

        const results = [];
        const now = Date.now();

        // Filter valid views
        const validViews = postViews.filter(({ postId }) => {
            if (!mongoose.Types.ObjectId.isValid(postId)) return false;
            
            const viewKey = `${userId}-${postId}`;
            if (recentViews.has(viewKey)) {
                const lastView = recentViews.get(viewKey);
                if (now - lastView < DUPLICATE_VIEW_WINDOW) {
                    return false;
                }
            }
            return true;
        });

        if (validViews.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No new views to process",
                data: { results: [], totalProcessed: 0 }
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            for (const { postId, viewDuration = 0 } of validViews) {
                const post = await Post.findById(postId, 'user').session(session);
                if (!post || post.user.toString() === userId) {
                    results.push({ 
                        postId, 
                        viewAdded: false, 
                        reason: !post ? "post-not-found" : "self-view" 
                    });
                    continue;
                }

                let interaction = await UserPostInteraction.findOne({
                    user: userId,
                    post: postId
                }, 'viewed viewCount').session(session);

                let shouldIncrementView = false;

                if (!interaction || !interaction.viewed) {
                    if (!interaction) {
                        interaction = new UserPostInteraction({
                            user: userId,
                            post: postId,
                            viewed: true,
                            viewCount: 1,
                            firstViewedAt: new Date(),
                            lastViewAt: new Date(),
                            totalViewDuration: viewDuration
                        });
                    } else {
                        interaction.viewed = true;
                        interaction.viewCount = 1;
                        interaction.lastViewAt = new Date();
                    }
                    shouldIncrementView = true;
                }

                if (interaction.isModified()) {
                    await interaction.save({ session });
                }

                if (shouldIncrementView) {
                    await Post.findByIdAndUpdate(
                        postId,
                        { $inc: { views: 1 } },
                        { session }
                    );
                    recentViews.set(`${userId}-${postId}`, now);
                }

                results.push({
                    postId,
                    viewAdded: shouldIncrementView,
                    reason: shouldIncrementView ? 'first-view' : 'repeat-view'
                });
            }

            await session.commitTransaction();

            res.status(200).json({
                success: true,
                message: `Processed ${results.length} post views`,
                data: { results, totalProcessed: results.length }
            });

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error("Batch track views error:", error);
        res.status(500).json({
            success: false,
            message: "Error tracking multiple post views",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

export const getPostAnalytics = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        const post = await Post.findById(postId, 'user views reactions.likes reactions.dislikes createdAt');
        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found"
            });
        }

        if (post.user.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Access denied. You can only view analytics for your own posts."
            });
        }

        const stats = await UserPostInteraction.aggregate([
            { $match: { post: new mongoose.Types.ObjectId(postId) } },
            {
                $group: {
                    _id: null,
                    totalInteractions: { $sum: 1 },
                    uniqueViewers: { $sum: { $cond: ["$viewed", 1, 0] } },
                    totalLikes: { $sum: { $cond: ["$liked", 1, 0] } },
                    totalDislikes: { $sum: { $cond: ["$disliked", 1, 0] } },
                    avgViewDuration: { $avg: { $cond: [{ $gt: ["$totalViewDuration", 0] }, "$totalViewDuration", null] } }
                }
            }
        ]);

        const analytics = stats[0] || {
            totalInteractions: 0,
            uniqueViewers: 0,
            totalLikes: 0,
            totalDislikes: 0,
            avgViewDuration: 0
        };

        const engagementRate = analytics.uniqueViewers > 0 ? 
            ((analytics.totalLikes + analytics.totalDislikes) / analytics.uniqueViewers * 100).toFixed(2) : 0;

        res.status(200).json({
            success: true,
            data: {
                post: {
                    _id: post._id,
                    totalViews: post.views,
                    likes: post.reactions.likes,
                    dislikes: post.reactions.dislikes,
                    createdAt: post.createdAt
                },
                analytics: {
                    uniqueViewers: analytics.uniqueViewers,
                    totalInteractions: analytics.totalInteractions,
                    engagementRate: parseFloat(engagementRate),
                    averageViewDuration: Math.round(analytics.avgViewDuration || 0),
                    likeDislikeRatio: analytics.totalDislikes > 0 ? 
                        (analytics.totalLikes / analytics.totalDislikes).toFixed(2) : analytics.totalLikes
                }
            }
        });

    } catch (error) {
        console.error("Get post analytics error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching post analytics",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};