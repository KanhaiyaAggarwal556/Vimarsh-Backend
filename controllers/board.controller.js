// controllers/board.controller.js

import Board from "../models/board.model.js";
import User from "../models/user.model.js";

export const test = (req, res) => {
    res.json({ success: true, message: "Board route working!" });
};

export const createBoard = async (req, res) => {
    try {
        const { userId, ...boardData } = req.body;
        
        // Check if user already has a board
        const existingBoard = await Board.findOne({ user: userId });
        if (existingBoard) {
            return res.status(400).json({
                success: false,
                message: "User already has a board"
            });
        }

        const newBoard = new Board({
            user: userId,
            ...boardData,
            socialStats: {
                followers: 0,
                following: 0,
                posts: 0,
                likes: 0
            },
            followers: [],
            following: []
        });

        const savedBoard = await newBoard.save();
        await savedBoard.populate('user');

        res.status(201).json({
            success: true,
            data: savedBoard
        });
    } catch (error) {
        console.error('Create board error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getBoardsByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Fetching board for user:', userId);

        // First, check if user exists
        const userExists = await User.findById(userId);
        if (!userExists) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // Find user's board with populated followers/following data
        let board = await Board.findOne({ user: userId })
            .populate('user')
            .populate({
                path: 'followers.user',
                select: 'userName userProfile fullName'
            })
            .populate({
                path: 'following.user', 
                select: 'userName userProfile fullName'
            });
        
        // If no board exists, create a default one
        if (!board) {
            console.log('No board found, creating default board for user:', userId);
            board = new Board({
                user: userId,
                socialStats: {
                    followers: 0,
                    following: 0,
                    posts: 0,
                    likes: 0
                },
                followers: [],
                following: []
            });
            await board.save();
            await board.populate('user');
        }

        console.log('Board found/created:', board);

        // Return as array to match frontend expectation
        res.json({
            success: true,
            data: [board]
        });

    } catch (error) {
        console.error('Get boards by user error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getAllBoards = async (req, res) => {
    try {
        const { page = 1, limit = 10, location, interests } = req.query;
        
        let query = {};
        if (location) query.location = new RegExp(location, 'i');
        if (interests) query.interests = { $in: interests.split(',') };

        const boards = await Board.find(query)
            .populate('user')
            .populate({
                path: 'followers.user',
                select: 'userName userProfile fullName'
            })
            .populate({
                path: 'following.user',
                select: 'userName userProfile fullName'
            })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const total = await Board.countDocuments(query);

        res.json({
            success: true,
            data: boards,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get all boards error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getBoardById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const board = await Board.findById(id)
            .populate('user')
            .populate('bookmarks')
            .populate({
                path: 'followers.user',
                select: 'userName userProfile fullName'
            })
            .populate({
                path: 'following.user',
                select: 'userName userProfile fullName'
            });

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            data: board
        });
    } catch (error) {
        console.error('Get board by ID error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const updateBoard = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const board = await Board.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('user');

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            data: board
        });
    } catch (error) {
        console.error('Update board error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// NEW FOLLOW/UNFOLLOW FUNCTIONS

export const followUser = async (req, res) => {
    try {
        const { currentUserId } = req.body; // User who wants to follow
        const { targetUserId } = req.params; // User to be followed

        if (currentUserId === targetUserId) {
            return res.status(400).json({
                success: false,
                message: "You cannot follow yourself"
            });
        }

        // Get both boards
        const [currentUserBoard, targetUserBoard] = await Promise.all([
            Board.findOne({ user: currentUserId }),
            Board.findOne({ user: targetUserId })
        ]);

        if (!currentUserBoard || !targetUserBoard) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        // Check if already following
        const alreadyFollowing = currentUserBoard.following.some(
            follow => follow.user.toString() === targetUserId
        );

        if (alreadyFollowing) {
            return res.status(400).json({
                success: false,
                message: "Already following this user"
            });
        }

        // Add to following list of current user
        currentUserBoard.following.push({
            user: targetUserId,
            followedAt: new Date()
        });
        currentUserBoard.socialStats.following += 1;

        // Add to followers list of target user
        targetUserBoard.followers.push({
            user: currentUserId,
            followedAt: new Date()
        });
        targetUserBoard.socialStats.followers += 1;

        // Save both boards
        await Promise.all([
            currentUserBoard.save(),
            targetUserBoard.save()
        ]);

        // Populate and return updated current user board
        await currentUserBoard.populate([
            {
                path: 'following.user',
                select: 'userName userProfile fullName'
            },
            {
                path: 'followers.user',
                select: 'userName userProfile fullName'
            }
        ]);

        res.json({
            success: true,
            message: "Successfully followed user",
            data: currentUserBoard
        });

    } catch (error) {
        console.error('Follow user error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const unfollowUser = async (req, res) => {
    try {
        const { currentUserId } = req.body; // User who wants to unfollow
        const { targetUserId } = req.params; // User to be unfollowed

        // Get both boards
        const [currentUserBoard, targetUserBoard] = await Promise.all([
            Board.findOne({ user: currentUserId }),
            Board.findOne({ user: targetUserId })
        ]);

        if (!currentUserBoard || !targetUserBoard) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        // Check if currently following
        const followingIndex = currentUserBoard.following.findIndex(
            follow => follow.user.toString() === targetUserId
        );

        if (followingIndex === -1) {
            return res.status(400).json({
                success: false,
                message: "Not following this user"
            });
        }

        // Remove from following list of current user
        currentUserBoard.following.splice(followingIndex, 1);
        currentUserBoard.socialStats.following = Math.max(0, currentUserBoard.socialStats.following - 1);

        // Remove from followers list of target user
        targetUserBoard.followers = targetUserBoard.followers.filter(
            follower => follower.user.toString() !== currentUserId
        );
        targetUserBoard.socialStats.followers = Math.max(0, targetUserBoard.socialStats.followers - 1);

        // Save both boards
        await Promise.all([
            currentUserBoard.save(),
            targetUserBoard.save()
        ]);

        // Populate and return updated current user board
        await currentUserBoard.populate([
            {
                path: 'following.user',
                select: 'userName userProfile fullName'
            },
            {
                path: 'followers.user',
                select: 'userName userProfile fullName'
            }
        ]);

        res.json({
            success: true,
            message: "Successfully unfollowed user",
            data: currentUserBoard
        });

    } catch (error) {
        console.error('Unfollow user error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getFollowers = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const board = await Board.findOne({ user: userId })
            .populate({
                path: 'followers.user',
                select: 'userName userProfile fullName',
                options: {
                    limit: limit * 1,
                    skip: (page - 1) * limit
                }
            });

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            data: board.followers,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: board.socialStats.followers,
                pages: Math.ceil(board.socialStats.followers / limit)
            }
        });

    } catch (error) {
        console.error('Get followers error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getFollowing = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const board = await Board.findOne({ user: userId })
            .populate({
                path: 'following.user',
                select: 'userName userProfile fullName',
                options: {
                    limit: limit * 1,
                    skip: (page - 1) * limit
                }
            });

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            data: board.following,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: board.socialStats.following,
                pages: Math.ceil(board.socialStats.following / limit)
            }
        });

    } catch (error) {
        console.error('Get following error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const checkFollowStatus = async (req, res) => {
    try {
        const { currentUserId, targetUserId } = req.params;

        const currentUserBoard = await Board.findOne({ user: currentUserId });

        if (!currentUserBoard) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        const isFollowing = currentUserBoard.following.some(
            follow => follow.user.toString() === targetUserId
        );

        res.json({
            success: true,
            data: {
                isFollowing,
                followedAt: isFollowing ? currentUserBoard.following.find(
                    follow => follow.user.toString() === targetUserId
                ).followedAt : null
            }
        });

    } catch (error) {
        console.error('Check follow status error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// EXISTING FUNCTIONS (keeping them for backward compatibility)

export const updateSocialStats = async (req, res) => {
    try {
        const { id } = req.params;
        const { socialStats } = req.body;

        const board = await Board.findByIdAndUpdate(
            id,
            { socialStats },
            { new: true }
        ).populate('user');

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            data: board
        });
    } catch (error) {
        console.error('Update social stats error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const updateSocialStatsIncrement = async (req, res) => {
    try {
        const { id } = req.params;
        const { field, increment = 1 } = req.body;

        const updateQuery = {};
        updateQuery[`socialStats.${field}`] = increment;

        const board = await Board.findByIdAndUpdate(
            id,
            { $inc: updateQuery },
            { new: true }
        ).populate('user');

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            data: board
        });
    } catch (error) {
        console.error('Increment social stats error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteBoard = async (req, res) => {
    try {
        const { id } = req.params;
        
        const board = await Board.findByIdAndDelete(id);

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            message: "Board deleted successfully"
        });
    } catch (error) {
        console.error('Delete board error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteBoardsByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await Board.deleteMany({ user: userId });

        res.json({
            success: true,
            message: `${result.deletedCount} boards deleted successfully`
        });
    } catch (error) {
        console.error('Delete boards by user error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const searchBoards = async (req, res) => {
    try {
        const { q, page = 1, limit = 10 } = req.query;
        
        if (!q) {
            return res.status(400).json({
                success: false,
                message: "Search query is required"
            });
        }

        const searchQuery = {
            $or: [
                { bio: new RegExp(q, 'i') },
                { location: new RegExp(q, 'i') },
                { interests: new RegExp(q, 'i') }
            ]
        };

        const boards = await Board.find(searchQuery)
            .populate('user')
            .populate({
                path: 'followers.user',
                select: 'userName userProfile fullName'
            })
            .populate({
                path: 'following.user',
                select: 'userName userProfile fullName'
            })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 });

        const total = await Board.countDocuments(searchQuery);

        res.json({
            success: true,
            data: boards,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Search boards error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const addBookmark = async (req, res) => {
    try {
        const { id, postId } = req.params;
        
        const board = await Board.findByIdAndUpdate(
            id,
            { $addToSet: { bookmarks: postId } },
            { new: true }
        ).populate('user').populate('bookmarks');

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            data: board
        });
    } catch (error) {
        console.error('Add bookmark error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const removeBookmark = async (req, res) => {
    try {
        const { id, postId } = req.params;
        
        const board = await Board.findByIdAndUpdate(
            id,
            { $pull: { bookmarks: postId } },
            { new: true }
        ).populate('user').populate('bookmarks');

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            data: board
        });
    } catch (error) {
        console.error('Remove bookmark error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getUserBookmarks = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 10 } = req.query;
        
        const board = await Board.findOne({ user: userId })
            .populate({
                path: 'bookmarks',
                options: {
                    limit: limit * 1,
                    skip: (page - 1) * limit,
                    sort: { createdAt: -1 }
                }
            });

        if (!board) {
            return res.status(404).json({
                success: false,
                message: "Board not found"
            });
        }

        res.json({
            success: true,
            data: board.bookmarks
        });
    } catch (error) {
        console.error('Get user bookmarks error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
