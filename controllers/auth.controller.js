import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { JWT_CONFIG } from "../config/jwt.config.js";
import { generateToken, setTokenCookies, clearTokenCookies } from "../utils/tokenUtils.js";
import { sendErrorResponse, sendSuccessResponse, sanitizeUser } from "../utils/responseUtils.js";
import { validatePasswordStrength, validateEmail, validateRequiredFields } from "../utils/validationUtils.js";

// Use Redis in production for OTP storage
export const otpStorage = new Map();

// Cleanup expired OTPs every 5 minutes
setInterval(() => {
    const now = Date.now();
    const toDelete = [];
    for (const [key, data] of otpStorage.entries()) {
        if (data.expiry < now) toDelete.push(key);
    }
    toDelete.forEach(key => otpStorage.delete(key));
    
    if (toDelete.length > 0) {
        console.log(`🧹 Cleaned up ${toDelete.length} expired OTP entries`);
    }
}, 5 * 60 * 1000);

// Rate limiting configurations
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { success: false, message: "Too many login attempts, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting in development for testing
        return process.env.NODE_ENV === 'development';
    }
});

export const otpRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1, // 1 OTP request per minute per IP
    message: { success: false, message: "Please wait before requesting another OTP" },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting in development for testing
        return process.env.NODE_ENV === 'development';
    }
});

// Email Configuration with improved error handling
const createTransporter = () => {
    try {
        console.log("🔧 Creating email transporter...");
        console.log("EMAIL_USER:", process.env.EMAIL_USER ? "✅ Set" : "❌ Missing");
        console.log("EMAIL_APP_PASSWORD:", process.env.EMAIL_APP_PASSWORD ? "✅ Set" : "❌ Missing");
        
        if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
            console.error("❌ Missing email credentials in environment variables");
            console.log("Please ensure EMAIL_USER and EMAIL_APP_PASSWORD are set in your .env file");
            return null;
        }

        // Fix: Changed from createTransporter to createTransport
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            },
            // Add connection timeout
            connectionTimeout: 60000, // 60 seconds
            socketTimeout: 60000, // 60 seconds
            // Add debug option for development
            debug: process.env.NODE_ENV === 'development',
            logger: process.env.NODE_ENV === 'development'
        });

        console.log("✅ Email transporter created successfully");
        
        // Test the connection with better error handling
        transporter.verify((error, success) => {
            if (error) {
                console.error("❌ Email transporter verification failed:");
                console.error("Error code:", error.code);
                console.error("Error message:", error.message);
                
                // Provide specific guidance based on error type
                if (error.code === 'EAUTH') {
                    console.error("🔑 Authentication failed. Please check:");
                    console.error("1. Your Gmail email address is correct");
                    console.error("2. You're using an App Password (not your regular Gmail password)");
                    console.error("3. 2-Factor Authentication is enabled on your Gmail account");
                } else if (error.code === 'ECONNECTION') {
                    console.error("🌐 Connection failed. Please check your internet connection");
                }
            } else {
                console.log("✅ Email server is ready to send messages");
            }
        });
        
        return transporter;
        
    } catch (error) {
        console.error("❌ Failed to create email transporter:");
        console.error("Error:", error.message);
        console.error("Stack:", error.stack);
        return null;
    }
};

// Create transporter instance
const transporter = createTransporter();

// ============ UTILITY FUNCTIONS ============
const generateOTP = () => {
    return crypto.randomInt(100000, 999999).toString();
};

const sendOTPEmail = async (email, otp) => {
    console.log("📧 Attempting to send OTP email to:", email);
    
    // Check if transporter exists
    if (!transporter) {
        console.error("❌ Email transporter not available");
        console.error("Please check your email configuration:");
        console.error("1. Ensure EMAIL_USER and EMAIL_APP_PASSWORD are set in .env");
        console.error("2. Use App Password for Gmail (not regular password)");
        console.error("3. Enable 2-Factor Authentication on your Gmail account");
        throw new Error("Email service is not configured properly. Please contact support.");
    }
    
    // Verify connection before sending with timeout
    try {
        console.log("🔍 Verifying email connection...");
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Connection verification timed out"));
            }, 10000); // 10 second timeout
            
            transporter.verify((error, success) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                } else {
                    resolve(success);
                }
            });
        });
        console.log("✅ Email connection verified");
    } catch (verifyError) {
        console.error("❌ Email connection verification failed:");
        console.error("Error:", verifyError.message);
        
        // Provide specific error messages based on error type
        if (verifyError.code === 'EAUTH') {
            throw new Error("Email authentication failed. Please check your App Password configuration.");
        } else if (verifyError.code === 'ECONNECTION' || verifyError.code === 'ETIMEDOUT') {
            throw new Error("Unable to connect to email server. Please check your internet connection and try again.");
        } else if (verifyError.message.includes('timeout')) {
            throw new Error("Email service connection timed out. Please try again later.");
        } else {
            throw new Error("Email service is currently unavailable. Please try again later.");
        }
    }
    
    const mailOptions = {
        from: {
            name: 'Vimarsh',
            address: process.env.EMAIL_USER
        },
        to: email,
        subject: 'Password Reset OTP - Vimarsh',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
                    <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset</h1>
                </div>
                
                <div style="background: #f8f9ff; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
                    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                        Hello! You've requested to reset your password. Use the verification code below:
                    </p>
                    
                    <div style="background: white; padding: 25px; border-radius: 8px; text-align: center; border: 2px dashed #667eea;">
                        <h2 style="color: #667eea; font-size: 36px; margin: 0; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                            ${otp}
                        </h2>
                    </div>
                    
                    <p style="color: #666; margin-top: 20px; font-size: 14px;">
                        ⏰ This code expires in <strong>10 minutes</strong>
                    </p>
                </div>
                
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107;">
                    <p style="color: #856404; margin: 0; font-size: 14px;">
                        <strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email and your password will remain unchanged.
                    </p>
                </div>
                
                <div style="text-align: center; margin-top: 30px;">
                    <p style="color: #999; font-size: 12px;">
                        This is an automated message from Vimarsh. Please do not reply to this email.
                    </p>
                </div>
            </div>
        `,
        // Add text version for better compatibility
        text: `
            Password Reset - Vimarsh
            
            Hello! You've requested to reset your password.
            
            Your verification code is: ${otp}
            
            This code expires in 10 minutes.
            
            If you didn't request this password reset, please ignore this email.
        `
    };
    
    try {
        console.log("📤 Sending email with options:", {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject
        });
        
        const info = await transporter.sendMail(mailOptions);
        console.log("✅ OTP email sent successfully");
        console.log("Message ID:", info.messageId);
        console.log("Preview URL:", nodemailer.getTestMessageUrl(info));
        return true;
    } catch (error) {
        console.error("❌ Failed to send OTP email:");
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        console.error("Response code:", error.responseCode);
        
        // Provide more specific error messages
        if (error.code === 'EAUTH') {
            throw new Error("Email authentication failed. Please verify your App Password is correct.");
        } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
            throw new Error("Unable to connect to email server. Please check your internet connection and try again.");
        } else if (error.responseCode === 534) {
            throw new Error("Gmail authentication failed. Please ensure you're using an App Password and 2FA is enabled.");
        } else if (error.responseCode === 535) {
            throw new Error("Invalid email credentials. Please check your email address and App Password.");
        } else if (error.code === 'EMESSAGE') {
            throw new Error("Invalid email message format. Please try again.");
        } else {
            console.error("Full email error object:", error);
            throw new Error(`Email sending failed: ${error.message || 'Unknown error'}. Please try again later.`);
        }
    }
};

// Input sanitization helper
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return input.trim().replace(/[<>\"']/g, '');
};

// ============ AUTHENTICATION CONTROLLERS ============

// Register new user
export const createUser = async (req, res) => {
    const session = await User.db.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { fullName, userName, email, password, profilepic } = req.body;

            // Sanitize inputs
            const sanitizedData = {
                fullName: sanitizeInput(fullName),
                userName: sanitizeInput(userName),
                email: sanitizeInput(email)?.toLowerCase(),
                password,
                profilepic: sanitizeInput(profilepic)
            };

            // Validation
            const fieldsValidation = validateRequiredFields(
                ['fullName', 'userName', 'email', 'password'], 
                sanitizedData
            );
            if (!fieldsValidation.valid) {
                throw new Error(fieldsValidation.message);
            }

            if (!validateEmail(sanitizedData.email)) {
                throw new Error("Please provide a valid email address");
            }

            const passwordValidation = validatePasswordStrength(password);
            if (!passwordValidation.valid) {
                throw new Error(passwordValidation.message);
            }

            // Check if user already exists (atomic operation within transaction)
            const [existingEmail, existingUsername] = await Promise.all([
                User.findOne({ email: sanitizedData.email }).session(session),
                User.findOne({ userName: sanitizedData.userName }).session(session)
            ]);

            if (existingEmail) {
                throw new Error("User with this email already exists");
            }

            if (existingUsername) {
                throw new Error("User with this username already exists");
            }

            // Hash password
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // Create user
            const userData = {
                fullName: sanitizedData.fullName,
                userName: sanitizedData.userName,
                email: sanitizedData.email,
                hashedPassword,
                lastLogin: new Date()
            };

            if (sanitizedData.profilepic) {
                userData.profilepic = sanitizedData.profilepic;
            }

            const newUser = new User(userData);
            const savedUser = await newUser.save({ session });

            // Generate tokens for auto-login
            const accessToken = generateToken(savedUser._id);
            const refreshToken = generateToken(savedUser._id, 'refresh');

            // Set cookies
            setTokenCookies(res, accessToken, refreshToken);

            return sendSuccessResponse(res, 201, "User created successfully", sanitizeUser(savedUser));
        });

    } catch (error) {
        console.error("Error creating user:", error);
        const statusCode = error.message.includes('already exists') ? 409 : 400;
        return sendErrorResponse(res, statusCode, error.message);
    } finally {
        session.endSession();
    }
};

// Login user with improved validation
export const loginUser = async (req, res) => {
    try {
        const { emailOrUsername, password } = req.body;

        // Validation
        if (!emailOrUsername || !password) {
            return sendErrorResponse(res, 400, "Email/username and password are required");
        }

        // Sanitize input
        const sanitizedInput = sanitizeInput(emailOrUsername);
        
        // Use the same email validation function
        const isEmail = validateEmail(sanitizedInput);
        
        // Find user
        const user = await User.findOne(
            isEmail 
                ? { email: sanitizedInput.toLowerCase() }
                : { userName: sanitizedInput }
        );

        if (!user) {
            return sendErrorResponse(res, 401, "Invalid credentials");
        }

        // Check if user is OAuth user
        if (user.hashedPassword === 'oauth_user') {
            return sendErrorResponse(res, 401, "Please login using your social media account");
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
        if (!isPasswordValid) {
            return sendErrorResponse(res, 401, "Invalid credentials");
        }

        // Update last login (don't fail login if this fails)
        try {
            await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });
        } catch (updateError) {
            console.error("Failed to update last login:", updateError);
        }

        // Generate tokens
        const accessToken = generateToken(user._id);
        const refreshToken = generateToken(user._id, 'refresh');

        // Set cookies
        setTokenCookies(res, accessToken, refreshToken);

        return sendSuccessResponse(res, 200, "Login successful", sanitizeUser(user));

    } catch (error) {
        console.error("Error logging in:", error);
        return sendErrorResponse(res, 500, "Internal server error");
    }
};


// Logout user
export const logoutUser = async (req, res) => {
    try {
        clearTokenCookies(res);
        return sendSuccessResponse(res, 200, "Logout successful");
    } catch (error) {
        console.error("Error logging out:", error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

// Get current user
export const getCurrentUser = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('-hashedPassword');
        
        if (!user) {
            return sendErrorResponse(res, 404, "User not found");
        }

        return sendSuccessResponse(res, 200, "User retrieved successfully", user);

    } catch (error) {
        console.error("Error getting current user:", error);
        return sendErrorResponse(res, 500, "Internal server error", error.message);
    }
};

// Refresh token
export const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.cookies;

        if (!refreshToken) {
            return sendErrorResponse(res, 401, "No refresh token provided");
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_CONFIG.REFRESH_TOKEN_SECRET);
        
        if (decoded.type !== 'refresh') {
            return sendErrorResponse(res, 401, "Invalid token type");
        }

        // Check if user exists
        const user = await User.findById(decoded.userId);
        if (!user) {
            return sendErrorResponse(res, 401, "User not found");
        }

        // Generate new tokens
        const newAccessToken = generateToken(user._id);
        const newRefreshToken = generateToken(user._id, 'refresh');

        // Set new cookies
        setTokenCookies(res, newAccessToken, newRefreshToken);

        return sendSuccessResponse(res, 200, "Token refreshed successfully");

    } catch (error) {
        console.error("Error refreshing token:", error);
        clearTokenCookies(res);
        return sendErrorResponse(res, 401, "Invalid refresh token");
    }
};

// ============ OAUTH CONTROLLER ============

// OAuth success handler
// controllers/auth.controller.js - FIXED OAUTH HANDLER

// OAuth success handler - FIXED VERSION
export const handleOAuthSuccess = async (req, res) => {
    try {
        if (!req.user) {
            console.log('OAuth: No user found in request');
            return res.redirect(`${process.env.CLIENT_URL}/login?error=oauth_no_user`);
        }

        console.log('OAuth success handler for user:', req.user._id);

        // FIXED: Set OAuth user flag and update last login with current timestamp
        const updateData = {
            lastLogin: new Date(),
            isOAuthUser: true, // Mark as OAuth user for more lenient session handling
            // Also update the updatedAt timestamp to ensure recent activity
            updatedAt: new Date()
        };

        // Update user data
        await User.findByIdAndUpdate(req.user._id, updateData);

        // Generate tokens with longer expiry for OAuth users
        const accessToken = generateToken(req.user._id);
        const refreshToken = generateToken(req.user._id, 'refresh');

        // Set cookies with proper security settings
        setTokenCookies(res, accessToken, refreshToken);

        // FIXED: Redirect with a delay and success flag to prevent immediate re-authentication
        console.log('OAuth tokens set, preparing redirect...');
        
        // Create a more specific redirect URL that the frontend can handle properly
        const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        const redirectUrl = `${baseUrl}/oauth-success?timestamp=${Date.now()}`;
        
        console.log('OAuth complete, redirecting to:', redirectUrl);
        
        // Add a small delay to ensure cookies are set
        setTimeout(() => {
            res.redirect(redirectUrl);
        }, 100);

    } catch (error) {
        console.error("OAuth success handler error:", error);
        const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        res.redirect(`${baseUrl}/login?error=oauth_error&details=${encodeURIComponent(error.message)}`);
    }
};

// Fixed forgotPassword controller
const securityDelay = () => new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        
        console.log('🔍 Password reset requested for:', email);

        // Validation
        if (!email) {
            await securityDelay();
            return sendErrorResponse(res, 400, "Email is required");
        }

        const sanitizedEmail = sanitizeInput(email)?.toLowerCase();

        if (!validateEmail(sanitizedEmail)) {
            await securityDelay();
            return sendErrorResponse(res, 400, "Please provide a valid email address");
        }

        // Check if user exists
        const user = await User.findOne({ email: sanitizedEmail });
        
        if (!user) {
            console.log('🔍 User not found for email:', sanitizedEmail);
            // Add delay to prevent timing attacks
            await securityDelay();
            
            // Option A: Explicit error (less secure but clearer UX)
            return sendErrorResponse(res, 404, "No account found with this email address. Please sign up first or check if you used a different email.");
            
            // Option B: Generic message (more secure)
            // return sendErrorResponse(res, 400, "If an account exists with this email, you would receive an OTP. Please ensure you're using the email address you registered with.");
        }

        // Check if user is OAuth user
        if (user.hashedPassword === 'oauth_user') {
            console.log('🔍 OAuth user attempted password reset:', sanitizedEmail);
            await securityDelay();
            return sendErrorResponse(res, 400, "This account uses social login. Please log in using Google, Facebook, or LinkedIn instead of resetting password.");
        }

        console.log('✅ Registered user found, generating OTP...');

        // Generate OTP
        const otp = generateOTP();
        const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

        // Store OTP
        otpStorage.set(sanitizedEmail, {
            otp,
            expiry: otpExpiry,
            userId: user._id,
            attempts: 0,
            userType: 'registered' // Mark as registered user
        });

        console.log('💾 OTP stored for registered user:', sanitizedEmail);

        // Send OTP email with comprehensive error handling
        try {
            await sendOTPEmail(sanitizedEmail, otp);
            console.log('✅ OTP email sent successfully to registered user:', sanitizedEmail);
            
            return sendSuccessResponse(res, 200, "OTP sent to your registered email address", { 
                email: sanitizedEmail,
                message: "Please check your email for the OTP code. The code will expire in 10 minutes.",
                expiresIn: "10 minutes",
                userStatus: "registered"
            });
            
        } catch (emailError) {
            console.error("❌ Failed to send OTP email:", emailError.message);
            
            // Remove OTP from storage since email failed
            otpStorage.delete(sanitizedEmail);
            
            // Return a user-friendly error message
            return sendErrorResponse(res, 500, "Failed to send OTP email. Please try again later.");
        }

    } catch (error) {
        console.error("❌ Forgot password error:", error);
        console.error("Stack trace:", error.stack);
        await securityDelay();
        return sendErrorResponse(res, 500, "An unexpected error occurred. Please try again later.");
    }
};




// Enhanced verifyOTP controller with registration check
export const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        console.log('🔍 OTP verification requested for:', email);

        if (!email || !otp) {
            return sendErrorResponse(res, 400, "Email and OTP are required");
        }

        const sanitizedEmail = sanitizeInput(email)?.toLowerCase();
        const sanitizedOTP = sanitizeInput(otp).toString().trim();

        // Double-check user exists (security measure)
        const user = await User.findOne({ email: sanitizedEmail });
        if (!user) {
            console.log('❌ User not found during OTP verification:', sanitizedEmail);
            return sendErrorResponse(res, 404, "No account found with this email address.");
        }

        // Get stored OTP
        const storedData = otpStorage.get(sanitizedEmail);
        if (!storedData) {
            console.log('❌ No OTP found for email:', sanitizedEmail);
            return sendErrorResponse(res, 400, "OTP expired or invalid. Please request a new one.");
        }

        // Verify this OTP belongs to a registered user
        if (!storedData.userType || storedData.userType !== 'registered') {
            console.log('❌ Invalid OTP session for email:', sanitizedEmail);
            otpStorage.delete(sanitizedEmail);
            return sendErrorResponse(res, 400, "Invalid session. Please start the password reset process again.");
        }

        // Check if OTP expired
        if (Date.now() > storedData.expiry) {
            console.log('⏰ OTP expired for email:', sanitizedEmail);
            otpStorage.delete(sanitizedEmail);
            return sendErrorResponse(res, 400, "OTP has expired. Please request a new one.");
        }

        // Check attempt limit
        if (storedData.attempts >= 3) {
            console.log('🚫 Too many OTP attempts for email:', sanitizedEmail);
            otpStorage.delete(sanitizedEmail);
            return sendErrorResponse(res, 400, "Too many invalid attempts. Please request a new OTP.");
        }

        // Convert both to strings for comparison
        const storedOTP = storedData.otp.toString().trim();
        const inputOTP = sanitizedOTP;
        
        console.log('🔍 OTP Comparison:', {
            stored: storedOTP,
            input: inputOTP,
            match: storedOTP === inputOTP
        });

        // Verify OTP
        if (storedOTP !== inputOTP) {
            storedData.attempts++;
            otpStorage.set(sanitizedEmail, storedData);
            console.log('❌ Invalid OTP for email:', sanitizedEmail, 'Attempts:', storedData.attempts);
            return sendErrorResponse(res, 400, `Invalid OTP. ${3 - storedData.attempts} attempts remaining.`);
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 15 * 60 * 1000; // 15 minutes

        // Store reset token with user verification
        otpStorage.set(`reset_${sanitizedEmail}`, {
            token: resetToken,
            expiry: resetTokenExpiry,
            userId: storedData.userId,
            userType: 'registered' // Mark as verified registered user
        });

        // Remove OTP from storage after successful verification
        otpStorage.delete(sanitizedEmail);
        console.log('✅ OTP verified successfully for registered user:', sanitizedEmail);

        return sendSuccessResponse(res, 200, "OTP verified successfully", { 
            resetToken: resetToken,
            email: sanitizedEmail,
            message: "You can now reset your password",
            expiresIn: "15 minutes"
        });

    } catch (error) {
        console.error("❌ OTP verification error:", error);
        return sendErrorResponse(res, 500, "An unexpected error occurred during OTP verification");
    }
};

// Enhanced resendOTP controller with registration check
export const resendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        console.log('🔄 OTP resend requested for:', email);

        if (!email) {
            return sendErrorResponse(res, 400, "Email is required");
        }

        const sanitizedEmail = sanitizeInput(email)?.toLowerCase();

        if (!validateEmail(sanitizedEmail)) {
            return sendErrorResponse(res, 400, "Please provide a valid email address");
        }

        // Check if user exists
        const user = await User.findOne({ email: sanitizedEmail });
        if (!user) {
            console.log('❌ User not found for OTP resend:', sanitizedEmail);
            return sendErrorResponse(res, 404, "No account found with this email address. Please sign up first.");
        }

        // Check if user is OAuth user
        if (user.hashedPassword === 'oauth_user') {
            console.log('🔍 OAuth user attempted OTP resend:', sanitizedEmail);
            return sendErrorResponse(res, 400, "This account uses social login. Please log in using your social media account.");
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

        // Update OTP in storage with user verification
        otpStorage.set(sanitizedEmail, {
            otp,
            expiry: otpExpiry,
            userId: user._id,
            attempts: 0,
            userType: 'registered' // Mark as registered user
        });

        try {
            // Send OTP email
            await sendOTPEmail(sanitizedEmail, otp);
            console.log('✅ OTP resent successfully to registered user:', sanitizedEmail);

            return sendSuccessResponse(res, 200, "New OTP sent to your registered email address", {
                email: sanitizedEmail,
                message: "Please check your email for the new OTP code",
                expiresIn: "10 minutes"
            });

        } catch (emailError) {
            console.error("❌ Failed to resend OTP:", emailError);
            // Remove OTP from storage since email failed
            otpStorage.delete(sanitizedEmail);
            return sendErrorResponse(res, 500, "Failed to send OTP. Please try again later.");
        }

    } catch (error) {
        console.error("❌ Resend OTP error:", error);
        return sendErrorResponse(res, 500, "An unexpected error occurred. Please try again later.");
    }
};

// Enhanced resetPassword controller with registration check
export const resetPassword = async (req, res) => {
    try {
        const { email, resetToken, newPassword } = req.body;
        console.log('🔍 Password reset attempt for:', email);

        if (!email || !resetToken || !newPassword) {
            return sendErrorResponse(res, 400, "Email, reset token, and new password are required");
        }

        // Validate password strength
        const passwordValidation = validatePasswordStrength(newPassword);
        if (!passwordValidation.valid) {
            return sendErrorResponse(res, 400, passwordValidation.message);
        }

        const sanitizedEmail = sanitizeInput(email)?.toLowerCase();

        // Double-check user exists
        const user = await User.findOne({ email: sanitizedEmail });
        if (!user) {
            console.log('❌ User not found during password reset:', sanitizedEmail);
            return sendErrorResponse(res, 404, "No account found with this email address.");
        }

        // Get stored reset token
        const storedData = otpStorage.get(`reset_${sanitizedEmail}`);
        if (!storedData) {
            console.log('❌ No reset token found for email:', sanitizedEmail);
            return sendErrorResponse(res, 400, "Reset token expired or invalid. Please start the password reset process again.");
        }

        // Verify this reset token belongs to a registered user
        if (!storedData.userType || storedData.userType !== 'registered') {
            console.log('❌ Invalid reset session for email:', sanitizedEmail);
            otpStorage.delete(`reset_${sanitizedEmail}`);
            return sendErrorResponse(res, 400, "Invalid session. Please start the password reset process again.");
        }

        // Check if token expired
        if (Date.now() > storedData.expiry) {
            console.log('⏰ Reset token expired for email:', sanitizedEmail);
            otpStorage.delete(`reset_${sanitizedEmail}`);
            return sendErrorResponse(res, 400, "Reset token has expired. Please start the password reset process again.");
        }

        // Verify reset token
        if (storedData.token !== resetToken) {
            console.log('❌ Invalid reset token for email:', sanitizedEmail);
            return sendErrorResponse(res, 400, "Invalid reset token");
        }

        // Verify user IDs match
        if (user._id.toString() !== storedData.userId.toString()) {
            console.log('❌ User ID mismatch during password reset:', sanitizedEmail);
            otpStorage.delete(`reset_${sanitizedEmail}`);
            return sendErrorResponse(res, 400, "Invalid session. Please start the password reset process again.");
        }

        // Prevent OAuth users from resetting password
        if (user.hashedPassword === 'oauth_user') {
            console.log('❌ OAuth user attempted password reset:', sanitizedEmail);
            otpStorage.delete(`reset_${sanitizedEmail}`);
            return sendErrorResponse(res, 400, "This account uses social login. Please log in using your social media account.");
        }

        // Hash new password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update user password
        const updatedUser = await User.findByIdAndUpdate(
            storedData.userId, 
            { hashedPassword: hashedPassword },
            { new: true }
        );

        if (!updatedUser) {
            console.log('❌ Failed to update password for user:', storedData.userId);
            return sendErrorResponse(res, 500, "Failed to update password. Please try again.");
        }

        // Remove reset token from storage
        otpStorage.delete(`reset_${sanitizedEmail}`);
        console.log('✅ Password reset successful for registered user:', sanitizedEmail);

        return sendSuccessResponse(res, 200, "Password reset successfully. You can now login with your new password.", {
            message: "Your password has been updated successfully"
        });

    } catch (error) {
        console.error("❌ Password reset error:", error);
        return sendErrorResponse(res, 500, "Failed to reset password. Please try again later.");
    }
};
