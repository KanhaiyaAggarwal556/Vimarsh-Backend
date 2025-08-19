// routes/user.route.js
import express from "express";
import {
    getAllUsers,
    getUserById,
    getUserByUsername,
    getUserByEmail,
    updateUserProfile,
    changePassword
} from "../controllers/user.controller.js";
import { authenticateToken, optionalAuth, checkOwnership } from "../middlewares/auth.middleware.js";
import User from "../models/user.model.js";
import { sendErrorResponse, sendSuccessResponse } from "../utils/responseUtils.js";
import { validateEmail } from "../utils/validationUtils.js";

const router = express.Router();

// ============ PUBLIC AVAILABILITY CHECK ROUTES ============
// These routes are for checking availability during registration (no auth required)

// Check email availability for registration
router.get('/email/:email/availability', async (req, res) => {
    try {
        const { email } = req.params;
        
        console.log('📧 Checking email availability for:', email);
        
        // Validate email format
        if (!validateEmail(email)) {
            return sendErrorResponse(res, 400, 'Invalid email format');
        }

        // Check if email exists
        const existingUser = await User.findOne({ 
            email: email.toLowerCase() 
        }).select('_id');

        if (existingUser) {
            // Email exists - return 200 with user data (this means email is TAKEN)
            console.log('❌ Email already exists');
            return sendSuccessResponse(res, 200, 'Email found', { exists: true });
        } else {
            // Email doesn't exist - return 404 (this means email is AVAILABLE)
            console.log('✅ Email is available');
            return sendErrorResponse(res, 404, 'Email not found');
        }

    } catch (error) {
        console.error('❌ Email availability check error:', error);
        return sendErrorResponse(res, 500, 'Internal server error');
    }
});

// Check username availability for registration
router.get('/username/:username/availability', async (req, res) => {
    try {
        const { username } = req.params;
        
        console.log('👤 Checking username availability for:', username);
        
        // Basic validation
        if (!username || username.length < 3) {
            return sendErrorResponse(res, 400, 'Username must be at least 3 characters');
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return sendErrorResponse(res, 400, 'Username can only contain letters, numbers, and underscores');
        }

        // Check if username exists
        const existingUser = await User.findOne({ 
            userName: username 
        }).select('_id');

        if (existingUser) {
            // Username exists - return 200 with user data (this means username is TAKEN)
            console.log('❌ Username already exists');
            return sendSuccessResponse(res, 200, 'Username found', { exists: true });
        } else {
            // Username doesn't exist - return 404 (this means username is AVAILABLE)
            console.log('✅ Username is available');
            return sendErrorResponse(res, 404, 'Username not found');
        }

    } catch (error) {
        console.error('❌ Username availability check error:', error);
        return sendErrorResponse(res, 500, 'Internal server error');
    }
});

// ============ USER RETRIEVAL ROUTES ============
// These routes have optional authentication - user data may vary based on auth status

// Get all users (with pagination and search)
router.get("/", optionalAuth, getAllUsers);

// Get user by username
router.get("/username/:username", optionalAuth, getUserByUsername);

// Get user by email (protected - only authenticated users)
router.get("/email/:email", authenticateToken, getUserByEmail);

// Get user by ID
router.get("/:id", optionalAuth, getUserById);

// ============ PROTECTED USER ROUTES ============
// These routes require authentication

// Update user profile (user can only update their own profile)
router.put("/:id", authenticateToken, checkOwnership, updateUserProfile);

// Change password (user can only change their own password)
router.patch("/:id/change-password", authenticateToken, checkOwnership, changePassword);

export default router;