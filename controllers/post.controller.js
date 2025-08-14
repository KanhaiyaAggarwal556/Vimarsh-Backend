import Post from "../models/post.model.js";
import UserPostInteraction from "../models/UserPostInteraction.model.js";
import mongoose from "mongoose";

// Rest of the existing functions remain the same...

export const getPostsByUserId = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const posts = await Post.find({ user: userId })
            .populate('user', 'userName fullName profilepic')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const totalPosts = await Post.countDocuments({ user: userId });
        const totalPages = Math.ceil(totalPosts / parseInt(limit));

        res.status(200).json({
            success: true,
            data: posts,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalPosts,
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error("Get posts by user ID error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching user posts",
            error: error.message
        });
    }
};

export const getRecentPosts = async (req, res) => {
    try {
        const { hours = 24, limit = 10 } = req.query;
        
        const timeLimit = new Date();
        timeLimit.setHours(timeLimit.getHours() - parseInt(hours));

        const posts = await Post.find({
            createdAt: { $gte: timeLimit }
        })
            .populate('user', 'userName fullName profilepic')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            message: `Posts from last ${hours} hours`,
            data: posts,
            count: posts.length
        });
    } catch (error) {
        console.error("Get recent posts error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching recent posts",
            error: error.message
        });
    }
};

export const getTrendingPosts = async (req, res) => {
    try {
        const { limit = 10, timeFrame = 7 } = req.query;
        
        const timeLimit = new Date();
        timeLimit.setDate(timeLimit.getDate() - parseInt(timeFrame));

        const posts = await Post.aggregate([
            {
                $match: {
                    createdAt: { $gte: timeLimit }
                }
            },
            {
                $addFields: {
                    trendingScore: {
                        $add: [
                            { $multiply: ["$reactions.likes", 3] },
                            { $multiply: ["$views", 0.1] },
                            { $multiply: [{ $subtract: ["$reactions.likes", "$reactions.dislikes"] }, 1] }
                        ]
                    }
                }
            },
            {
                $sort: { trendingScore: -1 }
            },
            {
                $limit: parseInt(limit)
            }
        ]);

        await Post.populate(posts, { path: 'user', select: 'userName fullName profilepic' });

        res.status(200).json({
            success: true,
            message: `Trending posts from last ${timeFrame} days`,
            data: posts,
            count: posts.length
        });
    } catch (error) {
        console.error("Get trending posts error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching trending posts",
            error: error.message
        });
    }
};

export const getUserAnalytics = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        const analytics = await Post.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: null,
                    totalPosts: { $sum: 1 },
                    totalViews: { $sum: "$views" },
                    totalLikes: { $sum: "$reactions.likes" },
                    totalComments: { $sum: "$reactions.comments" },
                    avgViews: { $avg: "$views" },
                    avgLikes: { $avg: "$reactions.likes" }
                }
            }
        ]);

        const monthlyData = await Post.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    posts: { $sum: 1 },
                    views: { $sum: "$views" },
                    likes: { $sum: "$reactions.likes" }
                }
            },
            {
                $sort: { "_id.year": -1, "_id.month": -1 }
            },
            {
                $limit: 6
            },
            {
                $sort: { "_id.year": 1, "_id.month": 1 }
            }
        ]);

        const formattedMonthlyData = monthlyData.map(item => {
            const date = new Date(item._id.year, item._id.month - 1);
            return {
                date: date.toLocaleDateString('en-US', { month: 'short' }),
                posts: item.posts,
                views: item.views,
                likes: item.likes
            };
        });

        const completeMonthlyData = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            
            const existingData = formattedMonthlyData.find(item => item.date === monthName);
            completeMonthlyData.push(existingData || {
                date: monthName,
                posts: 0,
                views: 0,
                likes: 0
            });
        }

        let monthlyGrowth = 0;
        if (completeMonthlyData.length >= 2) {
            const currentMonth = completeMonthlyData[completeMonthlyData.length - 1];
            const previousMonth = completeMonthlyData[completeMonthlyData.length - 2];
            
            if (previousMonth.views > 0) {
                monthlyGrowth = Math.round(((currentMonth.views - previousMonth.views) / previousMonth.views) * 100);
            } else if (currentMonth.views > 0) {
                monthlyGrowth = 100;
            }
        }

        const result = analytics[0] || {
            totalPosts: 0,
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            avgViews: 0,
            avgLikes: 0
        };

        res.status(200).json({
            success: true,
            data: {
                totalViews: result.totalViews || 0,
                totalLikes: result.totalLikes || 0,
                totalComments: result.totalComments || 0,
                totalShares: result.totalShares || 0,
                avgViewsPerPost: Math.round(result.avgViews || 0),
                avgLikesPerPost: Math.round(result.avgLikes || 0),
                totalPosts: result.totalPosts || 0,
                monthlyGrowth,
                chartData: completeMonthlyData
            }
        });
    } catch (error) {
        console.error("Get user analytics error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching user analytics",
            error: error.message
        });
    }
};

export const getUserPostInteractions = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        const interaction = await UserPostInteraction.findOne({
            user: req.userId,
            post: id
        });

        res.json({
            success: true,
            data: interaction || {
                liked: false,
                disliked: false,
                saved: false,
                viewed: false
            }
        });

    } catch (error) {
        console.error("Get user post interactions error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch user interactions",
            error: error.message
        });
    }
};

export const getAllPosts = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            sortBy = 'createdAt', 
            sortOrder = 'desc',
            tags,
            location,
            search
        } = req.query;

        const filter = {};
        
        if (tags) {
            filter.tags = { $in: tags.split(',') };
        }
        
        if (location) {
            filter.location = new RegExp(location, 'i');
        }
        
        if (search) {
            filter.$or = [
                { title: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const posts = await Post.find(filter)
            .populate('user', 'userName fullName profilepic')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        let postsWithInteractions = posts;
        if (req.userId) {
            const postIds = posts.map(post => post._id);
            const userInteractions = await UserPostInteraction.find({
                user: req.userId,
                post: { $in: postIds }
            });

            const interactionMap = {};
            userInteractions.forEach(interaction => {
                interactionMap[interaction.post.toString()] = {
                    liked: interaction.liked,
                    disliked: interaction.disliked,
                    saved: interaction.saved,
                    viewed: interaction.viewed
                };
            });

            postsWithInteractions = posts.map(post => ({
                ...post.toObject(),
                userInteraction: interactionMap[post._id.toString()] || {
                    liked: false,
                    disliked: false,
                    saved: false,
                    viewed: false
                }
            }));
        } else {
            postsWithInteractions = posts.map(post => ({
                ...post.toObject(),
                userInteraction: {
                    liked: false,
                    disliked: false,
                    saved: false,
                    viewed: false
                }
            }));
        }

        const totalPosts = await Post.countDocuments(filter);
        const totalPages = Math.ceil(totalPosts / parseInt(limit));

        res.status(200).json({
            success: true,
            data: postsWithInteractions,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalPosts,
                hasNext: parseInt(page) < totalPages,
                hasPrev: parseInt(page) > 1
            }
        });
    } catch (error) {
        console.error("Get all posts error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching posts",
            error: error.message
        });
    }
};

export const getPostById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        const post = await Post.findById(id).populate('user', 'userName fullName profilepic');

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found"
            });
        }

        let userInteraction = null;
        if (req.userId) {
            userInteraction = await UserPostInteraction.findOne({
                user: req.userId,
                post: id
            });
        }

        const postWithInteraction = {
            ...post.toObject(),
            userInteraction: userInteraction ? {
                liked: userInteraction.liked,
                disliked: userInteraction.disliked,
                saved: userInteraction.saved,
                viewed: userInteraction.viewed
            } : {
                liked: false,
                disliked: false,
                saved: false,
                viewed: false
            }
        };

        res.status(200).json({
            success: true,
            data: postWithInteraction
        });
    } catch (error) {
        console.error("Get post by ID error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching post",
            error: error.message
        });
    }
}