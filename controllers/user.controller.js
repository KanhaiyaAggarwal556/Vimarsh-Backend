// controllers/user.controller.js
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { validatePasswordStrength } from "../utils/validationUtils.js";  // ← ADD THIS
import { sendErrorResponse, sendSuccessResponse, sanitizeUser } from "../utils/responseUtils.js";  // ← ADD THIS

// ============ USER RETRIEVAL CONTROLLERS ============

// Get all users with pagination and search
export const getAllUsers = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build search query
        let query = {};
        if (search) {
            query = {
                $or: [
                    { fullName: { $regex: search, $options: 'i' } },
                    { userName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }

        // Build sort object
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute queries in parallel
        const [users, totalUsers] = await Promise.all([
            User.find(query)
                .select('-hashedPassword')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(query)
        ]);

        const totalPages = Math.ceil(totalUsers / parseInt(limit));

        return sendSuccessResponse(res, 200, "Users retrieved successfully", {
            users,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalUsers,
                hasNextPage: parseInt(page) < totalPages,
                hasPrevPage: parseInt(page) > 1,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error("Error fetching users:", error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

// Get user by ID
export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }

        const user = await User.findById(id).select('-hashedPassword');

        if (!user) {
            return sendErrorResponse(res, 404, "User not found");
        }

        return sendSuccessResponse(res, 200, "User retrieved successfully", user);

    } catch (error) {
        console.error("Error fetching user:", error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

// Get user by username
export const getUserByUsername = async (req, res) => {
    try {
        const { username } = req.params;

        if (!username) {
            return sendErrorResponse(res, 400, "Username is required");
        }

        const user = await User.findOne({ userName: username })
            .select('-hashedPassword');

        if (!user) {
            return sendErrorResponse(res, 404, "User not found");
        }

        return sendSuccessResponse(res, 200, "User retrieved successfully", user);

    } catch (error) {
        console.error("Error fetching user by username:", error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

// Get user by email
export const getUserByEmail = async (req, res) => {
    try {
        const { email } = req.params;

        if (!email) {
            return sendErrorResponse(res, 400, "Email is required");
        }

        const user = await User.findOne({ email: email.toLowerCase() })
            .select('-hashedPassword');

        if (!user) {
            return sendErrorResponse(res, 404, "User not found");
        }

        return sendSuccessResponse(res, 200, "User retrieved successfully", user);

    } catch (error) {
        console.error("Error fetching user by email:", error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

// ============ USER MODIFICATION CONTROLLERS ============

// Update user profile
export const updateUserProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const { fullName, userName, email, profilepic, bio } = req.body;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }

        // Check if user exists
        const existingUser = await User.findById(id);
        if (!existingUser) {
            return sendErrorResponse(res, 404, "User not found");
        }

        // Check if email or username is being changed and if they're already taken
        if (email && email.toLowerCase() !== existingUser.email) {
            const emailExists = await User.findOne({ 
                email: email.toLowerCase(), 
                _id: { $ne: id } 
            });
            if (emailExists) {
                return sendErrorResponse(res, 409, "Email already exists");
            }
        }

        if (userName && userName !== existingUser.userName) {
            const usernameExists = await User.findOne({ 
                userName, 
                _id: { $ne: id } 
            });
            if (usernameExists) {
                return sendErrorResponse(res, 409, "Username already exists");
            }
        }

        // Build update object
        const updateData = {};
        if (fullName) updateData.fullName = fullName;
        if (userName) updateData.userName = userName;
        if (email) updateData.email = email.toLowerCase();
        if (profilepic) updateData.profilepic = profilepic;
        if (bio !== undefined) updateData.bio = bio; // Allow empty string

        updateData.updatedAt = new Date();

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).select('-hashedPassword');

        return sendSuccessResponse(res, 200, "Profile updated successfully", sanitizeUser(updatedUser));

    } catch (error) {
        console.error("Error updating user profile:", error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

// Change password
export const changePassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { currentPassword, newPassword } = req.body;

        // Validation
        if (!currentPassword || !newPassword) {
            return sendErrorResponse(res, 400, "Current password and new password are required");
        }

        // Validate new password strength
        const passwordValidation = validatePasswordStrength(newPassword);
        if (!passwordValidation.valid) {
            return sendErrorResponse(res, 400, passwordValidation.message);
        }

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return sendErrorResponse(res, 400, "Invalid user ID format");
        }

        // Get user with password
        const user = await User.findById(id);
        if (!user) {
            return sendErrorResponse(res, 404, "User not found");
        }

        // Check if user is OAuth user
        if (user.hashedPassword === 'oauth_user') {
            return sendErrorResponse(res, 400, "Cannot change password for OAuth users");
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.hashedPassword);
        if (!isCurrentPasswordValid) {
            return sendErrorResponse(res, 400, "Current password is incorrect");
        }

        // Hash new password
        const saltRounds = 12;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await User.findByIdAndUpdate(id, {
            hashedPassword: hashedNewPassword,
            updatedAt: new Date()
        });

        return sendSuccessResponse(res, 200, "Password changed successfully");

    } catch (error) {
        console.error("Error changing password:", error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};