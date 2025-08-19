// controllers/board.controller.js

import Board from "../models/board.model.js";
import User from "../models/user.model.js";
import mongoose from "mongoose";
import { sendErrorResponse, sendSuccessResponse } from "../utils/responseUtils.js";
import { validateRequiredFields } from "../utils/validationUtils.js";

export const test = (req, res) => {
    return sendSuccessResponse(res, 200, "Board route working!");
};

export const createBoard = async (req, res) => {
    try {
        const { userId, ...boardData } = req.body;

        // Validate required fields
        const fieldsValidation = validateRequiredFields(['userId'], { userId });
        if (!fieldsValidation.valid) {
            return sendErrorResponse(res, 400, fieldsValidation.message);
        }

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }

        // Check if user exists
        const userExists = await User.findById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not found");
        }
        
        // Check if user already has a board
        const existingBoard = await Board.findOne({ user: userId });
        if (existingBoard) {
            return sendErrorResponse(res, 409, "User already has a board");
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

        return sendSuccessResponse(res, 201, "Board created successfully", savedBoard);

    } catch (error) {
        console.error('Create board error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const getBoardsByUser = async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('Fetching board for user:', userId);

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }

        // Check if user exists
        const userExists = await User.findById(userId);
        if (!userExists) {
            return sendErrorResponse(res, 404, "User not found");
        }

        // Find user's board with populated followers/following data
        let board = await Board.findOne({ user: userId })
            .populate('user')
            .populate({
                path: 'followers.user',
                select: 'userName profilepic fullName'
            })
            .populate({
                path: 'following.user', 
                select: 'userName profilepic fullName'
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
        return sendSuccessResponse(res, 200, "Board retrieved successfully", [board]);

    } catch (error) {
        console.error('Get boards by user error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const getAllBoards = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            location, 
            interests,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Build query
        let query = {};
        if (location) query.location = new RegExp(location, 'i');
        if (interests) query.interests = { $in: interests.split(',') };

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute queries in parallel
        const [boards, totalBoards] = await Promise.all([
            Board.find(query)
                .populate('user')
                .populate({
                    path: 'followers.user',
                    select: 'userName profilepic fullName'
                })
                .populate({
                    path: 'following.user',
                    select: 'userName profilepic fullName'
                })
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit)),
            Board.countDocuments(query)
        ]);

        const totalPages = Math.ceil(totalBoards / parseInt(limit));

        return sendSuccessResponse(res, 200, "Boards retrieved successfully", {
            boards,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalBoards,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Get all boards error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const getBoardById = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse(res, 400, "Invalid board ID format");
        }
        
        const board = await Board.findById(id)
            .populate('user')
            .populate('bookmarks')
            .populate({
                path: 'followers.user',
                select: 'userName profilepic fullName'
            })
            .populate({
                path: 'following.user',
                select: 'userName profilepic fullName'
            });

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        return sendSuccessResponse(res, 200, "Board retrieved successfully", board);

    } catch (error) {
        console.error('Get board by ID error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const updateBoard = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse(res, 400, "Invalid board ID format");
        }

        // Add updatedAt timestamp
        updateData.updatedAt = new Date();

        const board = await Board.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('user');

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        return sendSuccessResponse(res, 200, "Board updated successfully", board);

    } catch (error) {
        console.error('Update board error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

// FOLLOW/UNFOLLOW FUNCTIONS

export const followUser = async (req, res) => {
    const session = await Board.db.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { currentUserId } = req.body; // User who wants to follow
            const { targetUserId } = req.params; // User to be followed

            // Validation
            const fieldsValidation = validateRequiredFields(['currentUserId'], { currentUserId });
            if (!fieldsValidation.valid) {
                throw new Error(fieldsValidation.message);
            }

            // Validate ObjectIds
            if (!mongoose.Types.ObjectId.isValid(currentUserId) || !mongoose.Types.ObjectId.isValid(targetUserId)) {
                throw new Error("Invalid user ID format");
            }

            if (currentUserId === targetUserId) {
                throw new Error("You cannot follow yourself");
            }

            // Get both boards
            const [currentUserBoard, targetUserBoard] = await Promise.all([
                Board.findOne({ user: currentUserId }).session(session),
                Board.findOne({ user: targetUserId }).session(session)
            ]);

            if (!currentUserBoard || !targetUserBoard) {
                throw new Error("Board not found");
            }

            // Check if already following
            const alreadyFollowing = currentUserBoard.following.some(
                follow => follow.user.toString() === targetUserId
            );

            if (alreadyFollowing) {
                throw new Error("Already following this user");
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
                currentUserBoard.save({ session }),
                targetUserBoard.save({ session })
            ]);

            // Populate and return updated current user board
            await currentUserBoard.populate([
                {
                    path: 'following.user',
                    select: 'userName profilepic fullName'
                },
                {
                    path: 'followers.user',
                    select: 'userName profilepic fullName'
                }
            ]);

            return sendSuccessResponse(res, 200, "Successfully followed user", currentUserBoard);
        });

    } catch (error) {
        console.error('Follow user error:', error);
        return sendErrorResponse(res, 400, error.message);
    } finally {
        session.endSession();
    }
};

export const unfollowUser = async (req, res) => {
    const session = await Board.db.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { currentUserId } = req.body; // User who wants to unfollow
            const { targetUserId } = req.params; // User to be unfollowed

            // Validation
            const fieldsValidation = validateRequiredFields(['currentUserId'], { currentUserId });
            if (!fieldsValidation.valid) {
                throw new Error(fieldsValidation.message);
            }

            // Validate ObjectIds
            if (!mongoose.Types.ObjectId.isValid(currentUserId) || !mongoose.Types.ObjectId.isValid(targetUserId)) {
                throw new Error("Invalid user ID format");
            }

            // Get both boards
            const [currentUserBoard, targetUserBoard] = await Promise.all([
                Board.findOne({ user: currentUserId }).session(session),
                Board.findOne({ user: targetUserId }).session(session)
            ]);

            if (!currentUserBoard || !targetUserBoard) {
                throw new Error("Board not found");
            }

            // Check if currently following
            const followingIndex = currentUserBoard.following.findIndex(
                follow => follow.user.toString() === targetUserId
            );

            if (followingIndex === -1) {
                throw new Error("Not following this user");
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
                currentUserBoard.save({ session }),
                targetUserBoard.save({ session })
            ]);

            // Populate and return updated current user board
            await currentUserBoard.populate([
                {
                    path: 'following.user',
                    select: 'userName profilepic fullName'
                },
                {
                    path: 'followers.user',
                    select: 'userName profilepic fullName'
                }
            ]);

            return sendSuccessResponse(res, 200, "Successfully unfollowed user", currentUserBoard);
        });

    } catch (error) {
        console.error('Unfollow user error:', error);
        return sendErrorResponse(res, 400, error.message);
    } finally {
        session.endSession();
    }
};

export const getFollowers = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const board = await Board.findOne({ user: userId })
            .populate({
                path: 'followers.user',
                select: 'userName profilepic fullName',
                options: {
                    limit: parseInt(limit),
                    skip: skip
                }
            });

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        const totalPages = Math.ceil(board.socialStats.followers / parseInt(limit));

        return sendSuccessResponse(res, 200, "Followers retrieved successfully", {
            followers: board.followers,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                total: board.socialStats.followers,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Get followers error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const getFollowing = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const board = await Board.findOne({ user: userId })
            .populate({
                path: 'following.user',
                select: 'userName profilepic fullName',
                options: {
                    limit: parseInt(limit),
                    skip: skip
                }
            });

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        const totalPages = Math.ceil(board.socialStats.following / parseInt(limit));

        return sendSuccessResponse(res, 200, "Following retrieved successfully", {
            following: board.following,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                total: board.socialStats.following,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Get following error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const checkFollowStatus = async (req, res) => {
    try {
        const { currentUserId, targetUserId } = req.params;

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(currentUserId) || !mongoose.Types.ObjectId.isValid(targetUserId)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }

        const currentUserBoard = await Board.findOne({ user: currentUserId });

        if (!currentUserBoard) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        const followingEntry = currentUserBoard.following.find(
            follow => follow.user.toString() === targetUserId
        );

        const isFollowing = !!followingEntry;

        return sendSuccessResponse(res, 200, "Follow status retrieved successfully", {
            isFollowing,
            followedAt: isFollowing ? followingEntry.followedAt : null
        });

    } catch (error) {
        console.error('Check follow status error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

// EXISTING FUNCTIONS (updated with new response format)

export const updateSocialStats = async (req, res) => {
    try {
        const { id } = req.params;
        const { socialStats } = req.body;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse(res, 400, "Invalid board ID format");
        }

        const board = await Board.findByIdAndUpdate(
            id,
            { socialStats, updatedAt: new Date() },
            { new: true, runValidators: true }
        ).populate('user');

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        return sendSuccessResponse(res, 200, "Social stats updated successfully", board);

    } catch (error) {
        console.error('Update social stats error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const updateSocialStatsIncrement = async (req, res) => {
    try {
        const { id } = req.params;
        const { field, increment = 1 } = req.body;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse(res, 400, "Invalid board ID format");
        }

        // Validate field
        const allowedFields = ['followers', 'following', 'posts', 'likes'];
        if (!allowedFields.includes(field)) {
            return sendErrorResponse(res, 400, "Invalid field for social stats");
        }

        const updateQuery = {};
        updateQuery[`socialStats.${field}`] = increment;

        const board = await Board.findByIdAndUpdate(
            id,
            { 
                $inc: updateQuery,
                updatedAt: new Date()
            },
            { new: true }
        ).populate('user');

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        return sendSuccessResponse(res, 200, "Social stats updated successfully", board);

    } catch (error) {
        console.error('Increment social stats error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const deleteBoard = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse(res, 400, "Invalid board ID format");
        }
        
        const board = await Board.findByIdAndDelete(id);

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        return sendSuccessResponse(res, 200, "Board deleted successfully");

    } catch (error) {
        console.error('Delete board error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const deleteBoardsByUser = async (req, res) => {
    try {
        const { userId } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }
        
        const result = await Board.deleteMany({ user: userId });

        return sendSuccessResponse(res, 200, `${result.deletedCount} boards deleted successfully`);

    } catch (error) {
        console.error('Delete boards by user error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const searchBoards = async (req, res) => {
    try {
        const { q, page = 1, limit = 10 } = req.query;
        
        if (!q) {
            return sendErrorResponse(res, 400, "Search query is required");
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const searchQuery = {
            $or: [
                { bio: new RegExp(q, 'i') },
                { location: new RegExp(q, 'i') },
                { interests: new RegExp(q, 'i') }
            ]
        };

        const [boards, totalBoards] = await Promise.all([
            Board.find(searchQuery)
                .populate('user')
                .populate({
                    path: 'followers.user',
                    select: 'userName profilepic fullName'
                })
                .populate({
                    path: 'following.user',
                    select: 'userName profilepic fullName'
                })
                .skip(skip)
                .limit(parseInt(limit))
                .sort({ createdAt: -1 }),
            Board.countDocuments(searchQuery)
        ]);

        const totalPages = Math.ceil(totalBoards / parseInt(limit));

        return sendSuccessResponse(res, 200, "Search completed successfully", {
            boards,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalBoards,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Search boards error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const addBookmark = async (req, res) => {
    try {
        const { id, postId } = req.params;

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(postId)) {
            return sendErrorResponse(res, 400, "Invalid ID format");
        }
        
        const board = await Board.findByIdAndUpdate(
            id,
            { 
                $addToSet: { bookmarks: postId },
                updatedAt: new Date()
            },
            { new: true }
        ).populate('user').populate('bookmarks');

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        return sendSuccessResponse(res, 200, "Bookmark added successfully", board);

    } catch (error) {
        console.error('Add bookmark error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const removeBookmark = async (req, res) => {
    try {
        const { id, postId } = req.params;

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(postId)) {
            return sendErrorResponse(res, 400, "Invalid ID format");
        }
        
        const board = await Board.findByIdAndUpdate(
            id,
            { 
                $pull: { bookmarks: postId },
                updatedAt: new Date()
            },
            { new: true }
        ).populate('user').populate('bookmarks');

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        return sendSuccessResponse(res, 200, "Bookmark removed successfully", board);

    } catch (error) {
        console.error('Remove bookmark error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

export const getUserBookmarks = async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 10 } = req.query;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const board = await Board.findOne({ user: userId })
            .populate({
                path: 'bookmarks',
                options: {
                    limit: parseInt(limit),
                    skip: skip,
                    sort: { createdAt: -1 }
                }
            });

        if (!board) {
            return sendErrorResponse(res, 404, "Board not found");
        }

        return sendSuccessResponse(res, 200, "Bookmarks retrieved successfully", board.bookmarks);

    } catch (error) {
        console.error('Get user bookmarks error:', error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};