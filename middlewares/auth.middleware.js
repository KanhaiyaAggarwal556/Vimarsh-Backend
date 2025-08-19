import User from "../models/user.model.js";
import { 
    verifyToken, 
    generateToken, 
    setTokenCookies, 
    clearTokenCookies,
    isSessionExpiredDueToInactivity,
    shouldUpdateActivity 
} from "../utils/tokenUtils.js";

// ============ MAIN AUTHENTICATION MIDDLEWARE ============

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
        const decoded = verifyToken(accessToken);
        
        // Check if user still exists
        const user = await User.findById(decoded.userId).select('-hashedPassword');
        if (!user) {
            clearTokenCookies(res);
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        // Check if session expired due to inactivity
        const lastActivity = user.lastLogin || user.updatedAt;
        if (isSessionExpiredDueToInactivity(lastActivity)) {
            clearTokenCookies(res);
            return res.status(401).json({
                success: false,
                message: "Session expired due to inactivity. Please login again."
            });
        }

        // Update last activity if needed (to reduce DB writes)
        if (shouldUpdateActivity(user.lastLogin)) {
            await User.updateOne(
                { _id: user._id }, 
                { lastLogin: new Date() }
            );
            console.log(`Activity updated for user: ${user._id}`);
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
        clearTokenCookies(res);
        
        return res.status(401).json({
            success: false,
            message: "Invalid access token"
        });
    }
};

// ============ TOKEN REFRESH HANDLER ============

// Attempt to refresh expired access token
const attemptTokenRefresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.cookies;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: "Session expired, please login again"
            });
        }

        // Verify refresh token
        const decoded = verifyToken(refreshToken, 'refresh');
        
        if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
        }

        // Check if user exists
        const user = await User.findById(decoded.userId).select('-hashedPassword');
        if (!user) {
            throw new Error('User not found');
        }

        // Check if session expired due to inactivity
        const lastActivity = user.lastLogin || user.updatedAt;
        if (isSessionExpiredDueToInactivity(lastActivity)) {
            clearTokenCookies(res);
            return res.status(401).json({
                success: false,
                message: "Session expired due to inactivity. Please login again."
            });
        }

        // Generate new tokens
        const newAccessToken = generateToken(user._id);
        const newRefreshToken = generateToken(user._id, 'refresh');

        // Set new cookies
        setTokenCookies(res, newAccessToken, newRefreshToken);

        // Update last activity
        await User.updateOne(
            { _id: user._id }, 
            { lastLogin: new Date() }
        );

        console.log('Token refreshed successfully for user:', user._id);

        // Add user info to request
        req.userId = user._id;
        req.user = user;
        
        next();

    } catch (error) {
        console.error("Token refresh error:", error);
        clearTokenCookies(res);
        
        return res.status(401).json({
            success: false,
            message: "Session expired, please login again"
        });
    }
};

// ============ OPTIONAL AUTHENTICATION ============

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
    try {
        const { accessToken } = req.cookies;

        if (!accessToken) {
            return next(); // Continue without authentication
        }

        // Try to authenticate
        const decoded = verifyToken(accessToken);
        const user = await User.findById(decoded.userId).select('-hashedPassword');
        
        if (user) {
            // Check inactivity
            const lastActivity = user.lastLogin || user.updatedAt;
            if (!isSessionExpiredDueToInactivity(lastActivity)) {
                req.userId = decoded.userId;
                req.user = user;
                
                // Update last activity if needed
                if (shouldUpdateActivity(user.lastLogin)) {
                    await User.updateOne(
                        { _id: user._id }, 
                        { lastLogin: new Date() }
                    );
                }
            } else {
                // Clear expired cookies
                clearTokenCookies(res);
            }
        }

        next();

    } catch (error) {
        // For expired tokens, try to refresh
        if (error.name === 'TokenExpiredError') {
            try {
                const { refreshToken } = req.cookies;
                
                if (refreshToken) {
                    const decoded = verifyToken(refreshToken, 'refresh');
                    
                    if (decoded.type === 'refresh') {
                        const user = await User.findById(decoded.userId).select('-hashedPassword');
                        
                        if (user && !isSessionExpiredDueToInactivity(user.lastLogin || user.updatedAt)) {
                            // Generate new tokens
                            const newAccessToken = generateToken(user._id);
                            const newRefreshToken = generateToken(user._id, 'refresh');
                            
                            // Set new cookies
                            setTokenCookies(res, newAccessToken, newRefreshToken);
                            
                            // Update last activity
                            await User.updateOne(
                                { _id: user._id }, 
                                { lastLogin: new Date() }
                            );
                            
                            console.log('Token refreshed in optional auth for user:', user._id);
                            
                            req.userId = user._id;
                            req.user = user;
                        } else {
                            clearTokenCookies(res);
                        }
                    }
                }
            } catch (refreshError) {
                console.log("Optional auth refresh failed:", refreshError.message);
                // Clear invalid tokens
                clearTokenCookies(res);
            }
        }
        
        // Continue without authentication on any error
        next();
    }
};

// ============ AUTHORIZATION MIDDLEWARES ============

// Check if user owns the resource (for user-specific routes)
export const checkOwnership = (req, res, next) => {
    const { id } = req.params;
    
    if (!req.userId) {
        return res.status(401).json({
            success: false,
            message: "Authentication required"
        });
    }
    
    if (req.userId.toString() !== id) {
        return res.status(403).json({
            success: false,
            message: "Access denied: You can only access your own resources"
        });
    }
    
    next();
};

// Middleware to check if user can modify content (owner or admin)
export const canModifyContent = async (req, res, next) => {
    try {
        if (!req.userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }
        
        const user = await User.findById(req.userId);
        const { userId: resourceUserId } = req.body || req.params;
        
        // Allow if user is admin or owns the resource
        if (user.isAdmin || req.userId.toString() === resourceUserId) {
            return next();
        }
        
        return res.status(403).json({
            success: false,
            message: "Access denied: Insufficient privileges"
        });
        
    } catch (error) {
        console.error("Content modification check error:", error);
        return res.status(500).json({
            success: false,
            message: "Error checking modification privileges"
        });
    }
};