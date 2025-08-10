// controllers/user.controller.js
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

// JWT utility functions
const generateToken = (userId) => {
    return jwt.sign(
        { userId },
        process.env.JWT_SECRET || 'your-super-secret-jwt-key',
        { expiresIn: '15d' } // 15 days
    );
};

const generateRefreshToken = (userId) => {
    return jwt.sign(
        { userId, type: 'refresh' },
        process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
        { expiresIn: '30d' } // 30 days for refresh
    );
};

const setTokenCookies = (res, accessToken, refreshToken) => {
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days in milliseconds
    };

    res.cookie('accessToken', accessToken, cookieOptions);
    res.cookie('refreshToken', refreshToken, {
        ...cookieOptions,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for refresh token
    });
};

const clearTokenCookies = (res) => {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
};

// Updated loginUser and createUser functions - cleaned up

// Login user
export const loginUser = async (req, res) => {
    try {
        const { emailOrUsername, password } = req.body;

        // Validation
        if (!emailOrUsername || !password) {
            return res.status(400).json({
                success: false,
                message: "Email/username and password are required"
            });
        }

        // Determine if input is email or username
        const isEmail = /\S+@\S+\.\S+/.test(emailOrUsername);
        
        // Find user by email or username
        let user;
        if (isEmail) {
            user = await User.findOne({ email: emailOrUsername.toLowerCase() });
        } else {
            user = await User.findOne({ userName: emailOrUsername });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Check if user is OAuth user
        if (user.hashedPassword === 'oauth_user') {
            return res.status(401).json({
                success: false,
                message: "Please login using your social media account"
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        // Generate tokens
        const accessToken = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Set HTTP-only cookies
        setTokenCookies(res, accessToken, refreshToken);

        // Remove password from response
        const userResponse = user.toObject();
        delete userResponse.hashedPassword;

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: userResponse
        });

    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Create a new user (Registration)
export const createUser = async (req, res) => {
    try {
        const { fullName, userName, email, password, profilepic } = req.body;

        // Validation
        if (!fullName || !userName || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "All required fields must be provided"
            });
        }

        // Check if user already exists
        const existingUserByEmail = await User.findOne({ email });
        if (existingUserByEmail) {
            return res.status(409).json({
                success: false,
                message: "User with this email already exists"
            });
        }

        const existingUserByUsername = await User.findOne({ userName });
        if (existingUserByUsername) {
            return res.status(409).json({
                success: false,
                message: "User with this username already exists"
            });
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user object
        const userData = {
            fullName,
            userName,
            email,
            hashedPassword
        };

        // Add profile pic if provided
        if (profilepic) {
            userData.profilepic = profilepic;
        }

        const newUser = new User(userData);
        const savedUser = await newUser.save();

        // Generate tokens for auto-login after registration
        const accessToken = generateToken(savedUser._id);
        const refreshToken = generateRefreshToken(savedUser._id);

        // Set HTTP-only cookies
        setTokenCookies(res, accessToken, refreshToken);

        // Remove password from response
        const userResponse = savedUser.toObject();
        delete userResponse.hashedPassword;

        res.status(201).json({
            success: true,
            message: "User created successfully",
            data: userResponse
        });

    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
// Logout user
export const logoutUser = async (req, res) => {
    try {
        // Clear HTTP-only cookies
        clearTokenCookies(res);

        res.status(200).json({
            success: true,
            message: "Logout successful"
        });

    } catch (error) {
        console.error("Error logging out:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Get current authenticated user
export const getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-hashedPassword');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error("Error getting current user:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Refresh token
export const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.cookies;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: "No refresh token provided"
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key');
        
        if (decoded.type !== 'refresh') {
            return res.status(401).json({
                success: false,
                message: "Invalid token type"
            });
        }

        // Check if user exists
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        // Generate new tokens
        const newAccessToken = generateToken(user._id);
        const newRefreshToken = generateRefreshToken(user._id);

        // Set new cookies
        setTokenCookies(res, newAccessToken, newRefreshToken);

        res.status(200).json({
            success: true,
            message: "Token refreshed successfully"
        });

    } catch (error) {
        console.error("Error refreshing token:", error);
        clearTokenCookies(res);
        res.status(401).json({
            success: false,
            message: "Invalid refresh token"
        });
    }
};

// OAuth success handler (for Google, Facebook, LinkedIn)
export const handleOAuthSuccess = async (req, res) => {
    try {
        if (!req.user) {
            return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=oauth_no_user`);
        }

        // // Update last login
        // req.user.lastLogin = new Date();
        // await req.user.save();

        // Generate tokens
        const accessToken = generateToken(req.user._id);
        const refreshToken = generateRefreshToken(req.user._id);

        // Set HTTP-only cookies
        setTokenCookies(res, accessToken, refreshToken);

        // Redirect to success page
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/home`);

    } catch (error) {
        console.error("OAuth success handler error:", error);
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=oauth_error`);
    }
};


// Get all users
export const getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search } = req.query;
        const skip = (page - 1) * limit;

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

        const users = await User.find(query)
            .select('-hashedPassword')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const totalUsers = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            data: users,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalUsers / limit),
                totalUsers,
                hasNextPage: skip + users.length < totalUsers,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Get user by ID
export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid user ID format"
            });
        }

        const user = await User.findById(id).select('-hashedPassword');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Get user by username
export const getUserByUsername = async (req, res) => {
    try {
        const { username } = req.params;

        const user = await User.findOne({ userName: username.toLowerCase() })
            .select('-hashedPassword');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error("Error fetching user by username:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

// Get user by email
export const getUserByEmail = async (req, res) => {
    try {
        const { email } = req.params;

        const user = await User.findOne({ email: email.toLowerCase() })
            .select('-hashedPassword');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });

    } catch (error) {
        console.error("Error fetching user by email:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
