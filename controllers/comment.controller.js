import User from "../models/user.model.js";
import Post from "../models/post.model.js";
import Comment from "../models/comment.model.js";
import mongoose from 'mongoose';

// Test controller
export const test = (req, res) => {
    return res.json("Hello from the Comments Controller function");
}

// CREATE - Add a new comment
export const createComment = async (req, res) => {
    try {
        const { body, postId, userId } = req.body;

        console.log('Received comment data:', { body, postId, userId }); // Debug log

        // Add artificial delay to make posting feel more realistic
        await new Promise(resolve => setTimeout(resolve, 1200)); // 1.2s delay

        // Validation
        if (!body || !postId || !userId) {
            return res.status(400).json({
                success: false,
                message: "Body, postId, and userId are required"
            });
        }

        // Check if post exists
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found"
            });
        }

        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Create new comment
        const newComment = new Comment({
            body: body.trim(),
            post: postId,
            user: userId
        });

        const savedComment = await newComment.save();
        
        // Populate user and post info for response
        await savedComment.populate([
            { path: 'user', select: '_id userName fullName profilepic email' },
            { path: 'post', select: '_id' }
        ]);

        res.status(201).json({
            success: true,
            message: "Comment created successfully",
            data: savedComment
        });

    } catch (error) {
        console.error('Error creating comment:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// READ - Get all comments with pagination and filtering
export const getAllComments = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            postId,
            userId,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build filter object
        const filter = {};
        if (postId) filter.post = postId;
        if (userId) filter.user = userId;

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Calculate skip value for pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get comments with pagination
        const comments = await Comment.find(filter)
            .populate('user', '_id userName fullName profilepic email')
            .populate('post', '_id')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        // Get total count for pagination info
        const total = await Comment.countDocuments(filter);
        const totalPages = Math.ceil(total / parseInt(limit));

        res.status(200).json({
            success: true,
            data: comments,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalComments: total,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1
            }
        });

    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Helper function to calculate comment score for Instagram-like ordering
const calculateCommentScore = (comment, randomSeed = 1) => {
    const now = new Date();
    const commentAge = now - new Date(comment.createdAt);
    const ageInHours = commentAge / (1000 * 60 * 60);
    
    // Base reaction score (only likes now)
    const reactionScore = comment.reactions.likes * 2;
    
    // Time decay factor - newer comments get boost
    const timeDecayFactor = Math.max(0.1, 1 / (1 + ageInHours / 24)); // Decay over days
    
    // Deterministic "random" factor based on comment ID and seed
    const commentIdNumber = parseInt(comment._id.toString().slice(-8), 16);
    const pseudoRandom = ((commentIdNumber * randomSeed) % 1000) / 1000;
    const randomFactor = 0.3;
    const randomBoost = pseudoRandom * randomFactor;
    
    // Final score calculation
    const finalScore = (reactionScore * timeDecayFactor) + randomBoost;
    
    return finalScore;
};

// Enhanced function to get comment ordering strategy
const getCommentOrderingStrategy = (page, postId) => {
    // Use postId to create a consistent seed for this post
    const postSeed = parseInt(postId.slice(-8), 16) % 1000;
    
    // Different strategies for different pages, but consistent per post
    if (page === 1) {
        return { strategy: 'mixed', seed: postSeed };
    } else if (page === 2) {
        return { strategy: 'popular_leaning', seed: postSeed + 100 };
    } else {
        return { strategy: 'chronological_mixed', seed: postSeed + (page * 50) };
    }
};

// Helper function to add user reaction info to comments
const addUserReactionInfo = (comments, userId) => {
    return comments.map(comment => {
        const commentObj = typeof comment.toObject === 'function' ? comment.toObject() : comment;
        
        // Check if user has liked this comment
        if (userId && commentObj.likedBy) {
            commentObj.userHasLiked = commentObj.likedBy.includes(userId);
        } else {
            commentObj.userHasLiked = false;
        }
        
        // Remove likedBy array from response for privacy
        delete commentObj.likedBy;
        
        return commentObj;
    });
};

// READ - Get comments by post ID with consistent pagination (UPDATED VERSION)
export const getCommentsByPost = async (req, res) => {
    try {
        const { postId } = req.params;
        const { 
            page = 1, 
            limit = 15, 
            userId,
            orderType = 'smart' // 'smart', 'popular', 'recent', 'random'
        } = req.query;

        console.log(`Fetching comments for post: ${postId}, page: ${page}, limit: ${limit}, orderType: ${orderType}`);

        // Validate postId parameter
        if (!postId || postId === 'undefined' || postId === 'null') {
            return res.status(400).json({
                success: false,
                message: "Valid post ID is required"
            });
        }

        // Validate if postId is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        // Add artificial delay
        await new Promise(resolve => setTimeout(resolve, 800));

        // Check if post exists
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found"
            });
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        
        let comments = [];
        let sortCriteria = {};

        // Handle different ordering types with proper pagination
        switch (orderType) {
            case 'popular':
                sortCriteria = { 
                    'reactions.likes': -1, 
                    createdAt: -1 
                };
                break;
            case 'recent':
                sortCriteria = { createdAt: -1 };
                break;
            case 'random':
                // For random, use a deterministic seed based on post and page
                const randomSeed = parseInt(postId.slice(-6), 16) + (pageNum * 1000);
                
                // Fetch all comments first
                const allRandomComments = await Comment.find({ post: postId })
                    .populate('user', '_id userName fullName profilepic email')
                    .populate('post', '_id')
                    .sort({ createdAt: -1 });

                // Apply deterministic shuffle
                const shuffledComments = [...allRandomComments].sort((a, b) => {
                    const aHash = parseInt((a._id.toString() + randomSeed).slice(-8), 16);
                    const bHash = parseInt((b._id.toString() + randomSeed).slice(-8), 16);
                    return aHash - bHash;
                });

                // Apply pagination
                const skip = (pageNum - 1) * limitNum;
                comments = shuffledComments.slice(skip, skip + limitNum);
                break;
                
            case 'smart':
            default:
                // Smart ordering with consistent pagination
                const { strategy, seed } = getCommentOrderingStrategy(pageNum, postId);
                
                // For smart ordering, we need a larger sample to work with
                const sampleSize = Math.max(limitNum * 5, 100);
                const baseSkip = Math.max(0, (pageNum - 1) * limitNum - limitNum);
                
                // Fetch a larger sample around our target page
                const sampleComments = await Comment.find({ post: postId })
                    .populate('user', '_id userName fullName profilepic email')
                    .populate('post', '_id')
                    .sort({ createdAt: -1 })
                    .skip(baseSkip)
                    .limit(sampleSize);

                if (sampleComments.length > 0) {
                    // Calculate scores with consistent seed
                    const commentsWithScores = sampleComments.map(comment => ({
                        ...comment.toObject(),
                        _score: calculateCommentScore(comment, seed)
                    }));

                    // Sort by calculated score
                    commentsWithScores.sort((a, b) => {
                        if (strategy === 'mixed') {
                            return b._score - a._score;
                        } else if (strategy === 'popular_leaning') {
                            const scoreDiff = b._score - a._score;
                            const aVar = (parseInt(a._id.toString().slice(-4), 16) % 100) / 1000;
                            const bVar = (parseInt(b._id.toString().slice(-4), 16) % 100) / 1000;
                            return scoreDiff + (bVar - aVar) * 0.3;
                        } else {
                            // chronological_mixed
                            const timeDiff = new Date(b.createdAt) - new Date(a.createdAt);
                            const aVar = (parseInt(a._id.toString().slice(-4), 16) % 3600000);
                            const bVar = (parseInt(b._id.toString().slice(-4), 16) % 3600000);
                            return timeDiff + (bVar - aVar);
                        }
                    });

                    // Apply pagination within the sorted sample
                    const targetStart = (pageNum - 1) * limitNum;
                    const adjustedStart = Math.max(0, targetStart - baseSkip);
                    comments = commentsWithScores.slice(adjustedStart, adjustedStart + limitNum);

                    // Remove score from final response
                    comments = comments.map(comment => {
                        const { _score, ...commentWithoutScore } = comment;
                        return commentWithoutScore;
                    });
                } else {
                    comments = [];
                }
                break;
        }

        // For non-smart ordering, use regular database pagination
        if (orderType !== 'smart' && orderType !== 'random') {
            const skip = (pageNum - 1) * limitNum;
            comments = await Comment.find({ post: postId })
                .populate('user', '_id userName fullName profilepic email')
                .populate('post', '_id')
                .sort(sortCriteria)
                .skip(skip)
                .limit(limitNum);
        }

        const total = await Comment.countDocuments({ post: postId });
        const totalPages = Math.ceil(total / limitNum);

        // Add user reaction info to each comment
        const commentsWithReactions = addUserReactionInfo(comments, userId);

        console.log(`Returning ${commentsWithReactions.length} comments (${orderType} ordering) - Page ${pageNum}`);

        res.status(200).json({
            success: true,
            data: commentsWithReactions,
            pagination: {
                currentPage: pageNum,
                totalPages,
                totalComments: total,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
                orderType: orderType
            },
            meta: {
                orderingStrategy: orderType === 'smart' ? getCommentOrderingStrategy(pageNum, postId).strategy : orderType,
                description: getOrderingDescription(orderType, pageNum)
            }
        });

    } catch (error) {
        console.error('Error fetching comments by post:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Helper function to provide description of ordering
const getOrderingDescription = (orderType, page) => {
    switch (orderType) {
        case 'smart':
            if (page === 1) return 'Smart mix of popular and fresh comments';
            if (page === 2) return 'Popular comments with some variety';
            return 'Mixed chronological ordering';
        case 'popular':
            return 'Ordered by most likes';
        case 'recent':
            return 'Newest comments first';
        case 'random':
            return 'Random order for discovery';
        default:
            return 'Default ordering';
    }
};

// Additional endpoint to get comments with different ordering strategies
export const getCommentsWithStrategy = async (req, res) => {
    try {
        const { postId } = req.params;
        const { strategy = 'balanced' } = req.query; // 'balanced', 'engagement', 'discovery'
        
        let orderType = 'smart';
        
        switch (strategy) {
            case 'engagement':
                orderType = 'popular';
                break;
            case 'discovery':
                orderType = 'random';
                break;
            case 'fresh':
                orderType = 'recent';
                break;
            default:
                orderType = 'smart';
        }
        
        // Reuse the main function with determined order type
        req.query.orderType = orderType;
        return getCommentsByPost(req, res);
        
    } catch (error) {
        console.error('Error in getCommentsWithStrategy:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// READ - Get single comment by ID
export const getCommentById = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;

        const comment = await Comment.findById(id)
            .populate('user', '_id userName fullName profilepic email')
            .populate('post', '_id');

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: "Comment not found"
            });
        }

        // Add user reaction info
        const commentsWithReactions = addUserReactionInfo([comment], userId);

        res.status(200).json({
            success: true,
            data: commentsWithReactions[0]
        });

    } catch (error) {
        console.error('Error fetching comment:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// UPDATE - Update a comment
export const updateComment = async (req, res) => {
    try {
        const { id } = req.params;
        const { body } = req.body;

        // Validation
        if (!body || body.trim() === '') {
            return res.status(400).json({
                success: false,
                message: "Comment body is required"
            });
        }

        // Find and update comment
        const comment = await Comment.findByIdAndUpdate(
            id,
            { body: body.trim() },
            { new: true, runValidators: true }
        ).populate([
            { path: 'user', select: '_id userName fullName profilepic email' },
            { path: 'post', select: '_id' }
        ]);

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: "Comment not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Comment updated successfully",
            data: comment
        });

    } catch (error) {
        console.error('Error updating comment:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// UPDATED - Handle comment likes (persistent solution)
export const updateCommentReactions = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        console.log(`Toggling like for comment ${id} by user ${userId}`);

        // Add small delay to make reaction feel more responsive but visible
        await new Promise(resolve => setTimeout(resolve, 400));

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required"
            });
        }

        // Validate userId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        // Find comment
        const comment = await Comment.findById(id);
        if (!comment) {
            return res.status(404).json({
                success: false,
                message: "Comment not found"
            });
        }

        // Check if user has already liked this comment
        const userObjectId = new mongoose.Types.ObjectId(userId);
        const hasLiked = comment.likedBy.includes(userObjectId);
        
        let userHasLiked = false;
        
        if (hasLiked) {
            // User has already liked - remove like
            comment.likedBy.pull(userObjectId);
            comment.reactions.likes = Math.max(0, comment.reactions.likes - 1);
            userHasLiked = false;
            console.log(`Removed like from comment ${id}`);
        } else {
            // User hasn't liked - add like
            comment.likedBy.push(userObjectId);
            comment.reactions.likes += 1;
            userHasLiked = true;
            console.log(`Added like to comment ${id}`);
        }

        await comment.save();

        res.status(200).json({
            success: true,
            message: `Comment ${userHasLiked ? 'liked' : 'unliked'} successfully`,
            data: {
                _id: comment._id,
                reactions: {
                    likes: comment.reactions.likes
                },
                userHasLiked: userHasLiked
            }
        });

    } catch (error) {
        console.error('Error updating comment reactions:', error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Export the helper functions for potential reuse
export { calculateCommentScore, getCommentOrderingStrategy };