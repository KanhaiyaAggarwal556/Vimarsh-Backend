// middleware/auth.middleware.js
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

// Verify JWT token from HTTP-only cookie
export const authenticateToken = async (req, res, next) => {
    try {
        const { accessToken } = req.cookies;

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: "Access token required"
            });
        }

        // Verify access token
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
        
        // Check if user still exists
        const user = await User.findById(decoded.userId).select('-hashedPassword');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        // Check if token is still valid (not expired due to inactivity)
        const tokenIssueTime = new Date(decoded.iat * 1000);
        const lastActivity = user.lastLogin || user.updatedAt;
        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

        if (lastActivity < fifteenDaysAgo) {
            // Clear expired cookies
            res.clearCookie('accessToken');
            res.clearCookie('refreshToken');
            
            return res.status(401).json({
                success: false,
                message: "Session expired due to inactivity"
            });
        }

        // Update last activity (but not on every request to avoid too many DB writes)
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (!user.lastLogin || user.lastLogin < hourAgo) {
            user.lastLogin = new Date();
            await user.save();
        }

        // Add user info to request
        req.userId = decoded.userId;
        req.user = user;
        
        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            // Try to refresh token
            return attemptTokenRefresh(req, res, next);
        }
        
        console.error("Authentication error:", error);
        
        // Clear invalid cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        
        return res.status(401).json({
            success: false,
            message: "Invalid access token"
        });
    }
};

// Attempt to refresh expired access token
const attemptTokenRefresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.cookies;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: "No refresh token available"
            });
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key');
        
        if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
        }

        // Check if user exists
        const user = await User.findById(decoded.userId).select('-hashedPassword');
        if (!user) {
            throw new Error('User not found');
        }

        // Check inactivity period
        const lastActivity = user.lastLogin || user.updatedAt;
        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

        if (lastActivity < fifteenDaysAgo) {
            throw new Error('Session expired due to inactivity');
        }

        // Generate new tokens
        const newAccessToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET || 'your-super-secret-jwt-key',
            { expiresIn: '15d' }
        );

        const newRefreshToken = jwt.sign(
            { userId: user._id, type: 'refresh' },
            process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
            { expiresIn: '30d' }
        );

        // Set new cookies
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days
        };

        res.cookie('accessToken', newAccessToken, cookieOptions);
        res.cookie('refreshToken', newRefreshToken, {
            ...cookieOptions,
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for refresh token
        });

        // Update last activity
        user.lastLogin = new Date();
        await user.save();

        // Add user info to request
        req.userId = user._id;
        req.user = user;
        
        next();

    } catch (error) {
        console.error("Token refresh error:", error);
        
        // Clear all cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        
        return res.status(401).json({
            success: false,
            message: "Session expired, please login again"
        });
    }
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
    try {
        const { accessToken } = req.cookies;

        if (!accessToken) {
            return next(); // Continue without authentication
        }

        // Try to authenticate
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
        const user = await User.findById(decoded.userId).select('-hashedPassword');
        
        if (user) {
            // Check inactivity
            const lastActivity = user.lastLogin || user.updatedAt;
            const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

            if (lastActivity >= fifteenDaysAgo) {
                req.userId = decoded.userId;
                req.user = user;
            }
        }

        next();

    } catch (error) {
        // Ignore errors in optional auth
        next();
    }
};

// Check if user owns the resource (for user-specific routes)
export const checkOwnership = (req, res, next) => {
    const { id } = req.params;
    
    if (req.userId.toString() !== id) {
        return res.status(403).json({
            success: false,
            message: "Access denied: You can only access your own resources"
        });
    }
    
    next();
};

// Admin only middleware (if you have admin role)
export const adminOnly = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        
        if (!user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied: Admin privileges required"
            });
        }
        
        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error checking admin privileges"
        });
    }
};