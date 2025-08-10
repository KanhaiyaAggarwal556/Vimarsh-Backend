// routes/auth.route.js
import express from 'express';
import passport from '../config/Passport.js';
import { handleOAuthSuccess } from '../controllers/user.controller.js';
import crypto from "crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import User from "../models/user.model.js";

const router = express.Router();

// In-memory storage for OTPs (in production, use Redis or database)
const otpStorage = new Map();

// Email transporter configuration - FIXED: createTransport (not createTransporter)
const transporter = nodemailer.createTransport({
    service: 'gmail', // or your email service
    auth: {
        user: process.env.EMAIL_USER, // your email
        pass: process.env.EMAIL_APP_PASSWORD // your app password
    }
});

// Generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Password Reset OTP - Vimarsh',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p>You have requested to reset your password. Please use the following OTP to verify your identity:</p>
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
                    <h1 style="color: #667EEA; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
                </div>
                <p style="color: #666;">This OTP is valid for 10 minutes.</p>
                <p style="color: #666;">If you didn't request this, please ignore this email.</p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

// ============ EXISTING OAUTH ROUTES ============

// Google OAuth routes
router.get('/google', (req, res, next) => {
    console.log('Initiating Google OAuth');
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account'
    })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
    console.log('Google OAuth callback received');
    passport.authenticate('google', { 
        failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=google_auth_failed`,
        failureMessage: true
    })(req, res, async (err) => {
        if (err) {
            console.error('Google OAuth callback error:', err);
            return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=google_auth_error`);
        }
        
        if (!req.user) {
            console.log('Google OAuth: No user after authentication');
            return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=google_no_user`);
        }
        
        console.log('Google OAuth successful for user:', req.user._id);
        
        // Handle JWT token creation and cookie setting
        await handleOAuthSuccess(req, res);
    });
});

// Facebook OAuth routes
router.get('/facebook', (req, res, next) => {
    console.log('Initiating Facebook OAuth');
    passport.authenticate('facebook', { 
        scope: ['email'] 
    })(req, res, next);
});

router.get('/facebook/callback', (req, res, next) => {
    console.log('Facebook OAuth callback received');
    passport.authenticate('facebook', { 
        failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=facebook_auth_failed`,
        failureMessage: true
    })(req, res, async (err) => {
        if (err) {
            console.error('Facebook OAuth callback error:', err);
            return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=facebook_auth_error`);
        }
        
        if (!req.user) {
            console.log('Facebook OAuth: No user after authentication');
            return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=facebook_no_user`);
        }
        
        console.log('Facebook OAuth successful for user:', req.user._id);
        
        // Handle JWT token creation and cookie setting
        await handleOAuthSuccess(req, res);
    });
});

// LinkedIn OAuth routes
router.get('/linkedin', (req, res, next) => {
    console.log('Initiating LinkedIn OAuth');
    passport.authenticate('linkedin', {
        state: true
    })(req, res, next);
});

router.get('/linkedin/callback', (req, res, next) => {
    console.log('LinkedIn OAuth callback received');
    passport.authenticate('linkedin', { 
        failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=linkedin_auth_failed`,
        failureMessage: true
    })(req, res, async (err) => {
        if (err) {
            console.error('LinkedIn OAuth callback error:', err);
            return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=linkedin_auth_error`);
        }
        
        if (!req.user) {
            console.log('LinkedIn OAuth: No user after authentication');
            return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login?error=linkedin_no_user`);
        }
        
        console.log('LinkedIn OAuth successful for user:', req.user._id);
        
        // Handle JWT token creation and cookie setting
        await handleOAuthSuccess(req, res);
    });
});

// ============ PASSWORD RESET ROUTES (NEW) ============

// POST /auth/forgot-password - Check email and send OTP
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        console.log('Password reset requested for:', email);

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        // Check if user exists
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "No account found with this email address"
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

        // Store OTP in memory (use Redis in production)
        otpStorage.set(email.toLowerCase(), {
            otp,
            expiry: otpExpiry,
            userId: user._id
        });

        // Send OTP email
        await sendOTPEmail(email, otp);
        console.log('OTP sent to:', email);

        res.status(200).json({
            success: true,
            message: "OTP sent to your email address",
            email: email
        });

    } catch (error) {
        console.error("Forgot password error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to send OTP. Please try again."
        });
    }
});

// POST /auth/verify-otp - Verify OTP
router.post("/verify-otp", async (req, res) => {
    try {
        const { email, otp } = req.body;
        console.log('OTP verification for:', email);

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required"
            });
        }

        // Get stored OTP
        const storedData = otpStorage.get(email.toLowerCase());
        if (!storedData) {
            return res.status(400).json({
                success: false,
                message: "OTP expired or invalid. Please request a new one."
            });
        }

        // Check if OTP expired
        if (Date.now() > storedData.expiry) {
            otpStorage.delete(email.toLowerCase());
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new one."
            });
        }

        // Verify OTP
        if (storedData.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP. Please try again."
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes

        // Store reset token
        otpStorage.set(`reset_${email.toLowerCase()}`, {
            token: resetToken,
            expiry: resetTokenExpiry,
            userId: storedData.userId
        });

        // Remove OTP from storage
        otpStorage.delete(email.toLowerCase());
        console.log('OTP verified for:', email);

        res.status(200).json({
            success: true,
            message: "OTP verified successfully",
            resetToken: resetToken
        });

    } catch (error) {
        console.error("OTP verification error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to verify OTP. Please try again."
        });
    }
});

// POST /auth/reset-password - Reset password with token
router.post("/reset-password", async (req, res) => {
    try {
        const { email, resetToken, newPassword } = req.body;
        console.log('Password reset for:', email);

        if (!email || !resetToken || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Email, reset token, and new password are required"
            });
        }

        // Validate password strength
        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long"
            });
        }

        // Get stored reset token
        const storedData = otpStorage.get(`reset_${email.toLowerCase()}`);
        if (!storedData) {
            return res.status(400).json({
                success: false,
                message: "Reset token expired or invalid"
            });
        }

        // Check if token expired
        if (Date.now() > storedData.expiry) {
            otpStorage.delete(`reset_${email.toLowerCase()}`);
            return res.status(400).json({
                success: false,
                message: "Reset token has expired. Please start the process again."
            });
        }

        // Verify reset token
        if (storedData.token !== resetToken) {
            return res.status(400).json({
                success: false,
                message: "Invalid reset token"
            });
        }

        // Hash new password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update user password
        await User.findByIdAndUpdate(storedData.userId, {
            hashedPassword: hashedPassword
        });

        // Remove reset token from storage
        otpStorage.delete(`reset_${email.toLowerCase()}`);
        console.log('Password reset completed for:', email);

        res.status(200).json({
            success: true,
            message: "Password reset successfully"
        });

    } catch (error) {
        console.error("Password reset error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to reset password. Please try again."
        });
    }
});

// POST /auth/resend-otp - Resend OTP
router.post("/resend-otp", async (req, res) => {
    try {
        const { email } = req.body;
        console.log('OTP resend requested for:', email);

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }

        // Check if user exists
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "No account found with this email address"
            });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

        // Update OTP in storage
        otpStorage.set(email.toLowerCase(), {
            otp,
            expiry: otpExpiry,
            userId: user._id
        });

        // Send OTP email
        await sendOTPEmail(email, otp);
        console.log('OTP resent to:', email);

        res.status(200).json({
            success: true,
            message: "New OTP sent to your email address"
        });

    } catch (error) {
        console.error("Resend OTP error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to resend OTP. Please try again."
        });
    }
});

// ============ EXISTING USER/LOGOUT ROUTES ============

// Logout route - Updated for JWT
router.get('/logout', (req, res) => {
    console.log('User logout requested');
    
    // Clear JWT cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    
    // Also handle passport session logout if still using sessions
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
            }
            res.clearCookie('connect.sid'); // Clear session cookie
            res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/i/account/login`);
        });
    });
});

// Alternative logout for API calls
router.post('/logout', (req, res) => {
    console.log('API logout requested');
    
    // Clear JWT cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    
    res.json({ 
        success: true, 
        message: 'Logout successful' 
    });
});

// Get current user - Updated for JWT
router.get('/user', async (req, res) => {
    console.log('Auth status check');
    
    try {
        const { accessToken } = req.cookies;
        
        if (!accessToken) {
            return res.status(401).json({ 
                success: false, 
                message: 'Not authenticated' 
            });
        }

        // This will be handled by the auth middleware in your routes
        // For now, let's add a simple JWT verification
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(accessToken, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
        
        const user = await User.findById(decoded.userId).select('-hashedPassword');
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        res.json({ 
            success: true, 
            user: user 
        });
        
    } catch (error) {
        console.error('Auth check error:', error);
        res.status(401).json({ 
            success: false, 
            message: 'Invalid token' 
        });
    }
});

export default router;