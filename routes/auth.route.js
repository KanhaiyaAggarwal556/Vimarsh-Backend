import express from 'express';
import passport from '../config/Passport.js';
import { 
    loginUser, 
    createUser, 
    logoutUser, 
    getCurrentUser, 
    refreshToken,
    handleOAuthSuccess,
    forgotPassword,
    verifyOTP,
    resetPassword,
    resendOTP,
    authRateLimit,
    otpRateLimit,
    otpStorage  // Import otpStorage for debug routes
} from '../controllers/auth.controller.js';
import { authenticateToken } from '../middlewares/auth.middleware.js';

const router = express.Router();

// ============ BASIC AUTH ROUTES ============

// Register new user
router.post("/register", createUser);

// Login user
router.post("/login", authRateLimit, loginUser);

// Logout user
router.post("/logout", logoutUser);

// Get current user (protected)
router.get("/me", authenticateToken, getCurrentUser);

// Refresh token
router.post("/refresh", refreshToken);

// ============ PASSWORD RESET ROUTES (PUBLIC - FOR USERS WHO FORGOT PASSWORD) ============

// Request password reset OTP - PUBLIC (for users who can't log in)
router.post("/forgot-password", otpRateLimit, forgotPassword);

// Verify OTP - PUBLIC (for users who can't log in)
router.post("/verify-otp", verifyOTP);

// Reset password with token - PUBLIC (for users who can't log in)
router.post("/reset-password", resetPassword);

// Resend OTP - PUBLIC (for users who can't log in)
router.post("/resend-otp", resendOTP);

// ============ OAUTH ROUTES ============

// Google OAuth
router.get('/google', (req, res, next) => {
    console.log('Initiating Google OAuth');
    // Store the origin in session for better redirect handling
    req.session.oauthOrigin = req.get('referer') || `${process.env.CLIENT_URL}/login`;
    
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account'
    })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
    console.log('Google OAuth callback received');
    passport.authenticate('google', { 
        failureRedirect: `${process.env.CLIENT_URL}/login?error=google_auth_failed`,
        failureMessage: true
    })(req, res, async (err) => {
        if (err) {
            console.error('Google OAuth callback error:', err);
            return res.redirect(`${process.env.CLIENT_URL}/login?error=google_auth_error`);
        }
        
        if (!req.user) {
            console.log('Google OAuth: No user after authentication');
            return res.redirect(`${process.env.CLIENT_URL}/login?error=google_no_user`);
        }
        
        console.log('Google OAuth successful for user:', req.user._id);
        
        try {
            await handleOAuthSuccess(req, res);
        } catch (error) {
            console.error('OAuth success handler failed:', error);
            return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_handler_error`);
        }
    });
});

// Facebook OAuth
router.get('/facebook', (req, res, next) => {
    console.log('Initiating Facebook OAuth');
    // Store the origin in session for better redirect handling
    req.session.oauthOrigin = req.get('referer') || `${process.env.CLIENT_URL}/login`;
    
    passport.authenticate('facebook', { 
        scope: ['email'] 
    })(req, res, next);
});

router.get('/facebook/callback', (req, res, next) => {
    console.log('Facebook OAuth callback received');
    passport.authenticate('facebook', { 
        failureRedirect: `${process.env.CLIENT_URL}/login?error=facebook_auth_failed`,
        failureMessage: true
    })(req, res, async (err) => {
        if (err) {
            console.error('Facebook OAuth callback error:', err);
            return res.redirect(`${process.env.CLIENT_URL}/login?error=facebook_auth_error`);
        }
        
        if (!req.user) {
            console.log('Facebook OAuth: No user after authentication');
            return res.redirect(`${process.env.CLIENT_URL}/login?error=facebook_no_user`);
        }
        
        console.log('Facebook OAuth successful for user:', req.user._id);
        
        try {
            await handleOAuthSuccess(req, res);
        } catch (error) {
            console.error('OAuth success handler failed:', error);
            return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_handler_error`);
        }
    });
});

// LinkedIn OAuth
router.get('/linkedin', (req, res, next) => {
    console.log('Initiating LinkedIn OAuth');
    // Store the origin in session for better redirect handling
    req.session.oauthOrigin = req.get('referer') || `${process.env.CLIENT_URL}/login`;
    
    passport.authenticate('linkedin', {
        state: true
    })(req, res, next);
});

router.get('/linkedin/callback', (req, res, next) => {
    console.log('LinkedIn OAuth callback received');
    passport.authenticate('linkedin', { 
        failureRedirect: `${process.env.CLIENT_URL}/login?error=linkedin_auth_failed`,
        failureMessage: true
    })(req, res, async (err) => {
        if (err) {
            console.error('LinkedIn OAuth callback error:', err);
            return res.redirect(`${process.env.CLIENT_URL}/login?error=linkedin_auth_error`);
        }
        
        if (!req.user) {
            console.log('LinkedIn OAuth: No user after authentication');
            return res.redirect(`${process.env.CLIENT_URL}/login?error=linkedin_no_user`);
        }
        
        console.log('LinkedIn OAuth successful for user:', req.user._id);
        
        try {
            await handleOAuthSuccess(req, res);
        } catch (error) {
            console.error('OAuth success handler failed:', error);
            return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_handler_error`);
        }
    });
});

// Add this to your auth routes for debugging (DEVELOPMENT ONLY)
if (process.env.NODE_ENV === 'development') {
    // Debug route to check OTP storage
    router.get('/debug-otp/:email', (req, res) => {
        try {
            const email = req.params.email.toLowerCase();
            const otpData = otpStorage.get(email);
            const resetData = otpStorage.get(`reset_${email}`);
            
            res.json({
                success: true,
                email: email,
                otpData: otpData ? {
                    otp: otpData.otp,
                    expiry: new Date(otpData.expiry),
                    isExpired: Date.now() > otpData.expiry,
                    attempts: otpData.attempts,
                    timeRemaining: Math.max(0, Math.floor((otpData.expiry - Date.now()) / 1000)) + ' seconds'
                } : null,
                resetData: resetData ? {
                    hasToken: !!resetData.token,
                    expiry: new Date(resetData.expiry),
                    isExpired: Date.now() > resetData.expiry
                } : null,
                storageKeys: Array.from(otpStorage.keys()),
                totalEntries: otpStorage.size
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Debug route to clear OTP storage
    router.delete('/debug-clear-otp/:email', (req, res) => {
        try {
            const email = req.params.email.toLowerCase();
            const deletedOtp = otpStorage.delete(email);
            const deletedReset = otpStorage.delete(`reset_${email}`);
            
            res.json({
                success: true,
                message: `Cleared OTP data for ${email}`,
                deletedOtp,
                deletedReset,
                remainingEntries: otpStorage.size
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
}

export default router;