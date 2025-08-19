import mongoose from "mongoose";

// Simple in-memory cache for recent views to prevent duplicates
const rateLimitMap = new Map();
const viewTrackingCache = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    // Clean rate limit map
    for (const [key, data] of rateLimitMap.entries()) {
        if (now > data.resetTime) {
            rateLimitMap.delete(key);
        }
    }
    
    // Clean view tracking cache  
    for (const [key, timestamp] of viewTrackingCache.entries()) {
        if (timestamp < fiveMinutesAgo) {
            viewTrackingCache.delete(key);
        }
    }
}, 5 * 60 * 1000);

// Rate limiting middleware for view tracking
export const viewTrackingRateLimit = (req, res, next) => {
    const userId = req.userId;
    const now = Date.now();
    
    if (!userId) return next();
    
    const rateLimitKey = `rate-${userId}`;
    const userActivity = rateLimitMap.get(rateLimitKey);
    
    if (!userActivity || now > userActivity.resetTime) {
        // Reset or create new rate limit window
        rateLimitMap.set(rateLimitKey, {
            count: 1,
            resetTime: now + 60000 // 1 minute window
        });
        return next();
    }
    
    if (userActivity.count >= 60) { // Max 60 view tracking requests per minute
        return res.status(429).json({
            success: false,
            message: "Too many requests. Please slow down.",
            retryAfter: Math.ceil((userActivity.resetTime - now) / 1000)
        });
    }
    
    userActivity.count++;
    next();
};

// Improved automatic view tracking middleware for GET requests
export const autoTrackPostView = async (req, res, next) => {
    // Only track views on successful GET requests for posts
    const originalSend = res.send;
    
    res.send = function(data) {
        // Call original send first
        originalSend.call(this, data);
        
        // Then handle view tracking asynchronously (don't block response)
        setImmediate(() => {
            try {
                const postId = req.params.postId || req.params.id;
                const userId = req.userId;
                
                // Only track on successful responses and valid data
                if (res.statusCode === 200 && userId && postId && 
                    mongoose.Types.ObjectId.isValid(postId)) {
                    
                    const viewKey = `${userId}-${postId}`;
                    const now = Date.now();
                    
                    // Check if we've tracked this view recently (prevent rapid duplicates)
                    if (!viewTrackingCache.has(viewKey)) {
                        viewTrackingCache.set(viewKey, now);
                        
                        // Queue view tracking (fire and forget)
                        trackViewAsync(userId, postId).catch(error => {
                            console.error('Auto view tracking failed:', error);
                        });
                    }
                }
            } catch (error) {
                console.error('Auto view tracking middleware error:', error);
            }
        });
    };
    
    next();
};

// FIXED: Async view tracking function with proper deduplication
async function trackViewAsync(userId, postId) {
    try {
        const Post = (await import("../models/post.model.js")).default;
        const UserPostInteraction = (await import("../models/UserPostInteraction.model.js")).default;
        
        // Check if post exists and user is not the author
        const post = await Post.findById(postId, 'user');
        if (!post || post.user.toString() === userId) {
            return; // Don't track self-views or invalid posts
        }
        
        // FIXED: Check if user has EVER viewed this post (not just within 24 hours)
        const existingInteraction = await UserPostInteraction.findOne({
            user: userId,
            post: postId,
            viewed: true // If viewed is true, they've already seen it
        }, 'viewed viewCount lastViewAt');
        
        // If user has already viewed this post, don't increment view count
        if (existingInteraction && existingInteraction.viewed) {
            // Just update the last view time without incrementing counts
            await UserPostInteraction.findOneAndUpdate(
                { user: userId, post: postId },
                {
                    $set: {
                        lastViewAt: new Date(),
                        lastInteraction: new Date()
                    }
                }
            );
            return; // Don't increment view count
        }
        
        // This is a first-time view - increment counts
        await UserPostInteraction.findOneAndUpdate(
            { user: userId, post: postId },
            {
                $set: {
                    viewed: true,
                    lastViewAt: new Date(),
                    lastInteraction: new Date()
                },
                $inc: { viewCount: 1 },
                $setOnInsert: {
                    liked: false,
                    disliked: false,
                    saved: false,
                    shared: false,
                    firstViewedAt: new Date(),
                    totalViewDuration: 0,
                    referralSource: 'auto'
                }
            },
            { 
                upsert: true, 
                new: true,
                runValidators: false // Skip validation for performance
            }
        );
        
        // Increment post view count (only for first-time views)
        await Post.findByIdAndUpdate(postId, { $inc: { views: 1 } });
        
    } catch (error) {
        // Log error but don't throw - this is fire-and-forget
        console.error('Async view tracking error:', error);
    }
}

// Get cache statistics (for debugging)
export const getCacheStats = () => {
    return {
        rateLimitEntries: rateLimitMap.size,
        viewCacheEntries: viewTrackingCache.size,
        memoryUsage: process.memoryUsage()
    };
};

// Cleanup function for graceful shutdown
export const cleanup = () => {
    rateLimitMap.clear();
    viewTrackingCache.clear();
};