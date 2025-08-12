// config/passport.js - FIXED with environment validation
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
import User from '../models/user.model.js';
import Board from '../models/board.model.js';
import dotenv from 'dotenv';

// CRITICAL: Load environment variables at the top
dotenv.config();

// Debug: Check if environment variables are loaded
console.log('🔍 Checking OAuth environment variables...');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Present' : '❌ Missing');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Present' : '❌ Missing');
console.log('FACEBOOK_APP_ID:', process.env.FACEBOOK_APP_ID ? '✅ Present' : '❌ Missing');
console.log('FACEBOOK_APP_SECRET:', process.env.FACEBOOK_APP_SECRET ? '✅ Present' : '❌ Missing');
console.log('LINKEDIN_CLIENT_ID:', process.env.LINKEDIN_CLIENT_ID ? '✅ Present' : '❌ Missing');
console.log('LINKEDIN_CLIENT_SECRET:', process.env.LINKEDIN_CLIENT_SECRET ? '✅ Present' : '❌ Missing');

// Validate required environment variables
const requiredVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'FACEBOOK_APP_ID',
    'FACEBOOK_APP_SECRET',
    'LINKEDIN_CLIENT_ID',
    'LINKEDIN_CLIENT_SECRET'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    console.error('🔧 Please add these to your .env file');
    // Don't throw error, just log and continue with limited functionality
}

// Google OAuth Strategy - Only configure if credentials exist
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback"
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            console.log('Google OAuth - Profile received:', profile.id);
            
            // Check if user already exists
            let existingUser = await User.findOne({ 
                $or: [
                    { email: profile.emails?.[0]?.value },
                    { googleId: profile.id }
                ]
            });

            if (existingUser) {
                console.log('Google OAuth - Existing user found');
                // Update googleId if it doesn't exist
                if (!existingUser.googleId) {
                    existingUser.googleId = profile.id;
                    await existingUser.save();
                }
                return done(null, existingUser);
            }

            console.log('Google OAuth - Creating new user');
            // Create new user
            const newUser = new User({
                fullName: profile.displayName || 'Google User',
                userName: await generateUniqueUsername(profile.displayName || 'googleuser'),
                email: profile.emails?.[0]?.value || '',
                hashedPassword: 'oauth_user', 
                profilepic: profile.photos?.[0]?.value || '',
                googleId: profile.id,
            });

            const savedUser = await newUser.save();
            await createUserBoard(savedUser._id);

            console.log('Google OAuth - New user created:', savedUser._id);
            return done(null, savedUser);
        } catch (error) {
            console.error('Google OAuth Error:', error);
            return done(error, null);
        }
    }));
    console.log('✅ Google OAuth strategy configured');
} else {
    console.log('⚠️ Google OAuth strategy skipped - missing credentials');
}

// Facebook OAuth Strategy - Only configure if credentials exist
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: "/auth/facebook/callback",
        profileFields: ['id', 'displayName', 'emails', 'photos']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            console.log('Facebook OAuth - Profile received:', profile.id);
            
            let existingUser = await User.findOne({ 
                $or: [
                    { email: profile.emails?.[0]?.value },
                    { facebookId: profile.id }
                ]
            });

            if (existingUser) {
                console.log('Facebook OAuth - Existing user found');
                if (!existingUser.facebookId) {
                    existingUser.facebookId = profile.id;
                    await existingUser.save();
                }
                return done(null, existingUser);
            }

            console.log('Facebook OAuth - Creating new user');
            const newUser = new User({
                fullName: profile.displayName || 'Facebook User',
                userName: await generateUniqueUsername(profile.displayName || 'facebookuser'),
                email: profile.emails?.[0]?.value || '',
                hashedPassword: 'oauth_user',
                profilepic: profile.photos?.[0]?.value || '',
                facebookId: profile.id,
            });

            const savedUser = await newUser.save();
            await createUserBoard(savedUser._id);

            console.log('Facebook OAuth - New user created:', savedUser._id);
            return done(null, savedUser);
        } catch (error) {
            console.error('Facebook OAuth Error:', error);
            return done(error, null);
        }
    }));
    console.log('✅ Facebook OAuth strategy configured');
} else {
    console.log('⚠️ Facebook OAuth strategy skipped - missing credentials');
}

// LinkedIn OAuth Strategy - Only configure if credentials exist
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    passport.use(new LinkedInStrategy({
        clientID: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackURL: "/auth/linkedin/callback",
        scope: ['r_emailaddress', 'r_liteprofile'],
        state: true // Add state parameter for security
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            console.log('LinkedIn OAuth - Profile received:', profile.id);
            
            let existingUser = await User.findOne({ 
                $or: [
                    { email: profile.emails?.[0]?.value },
                    { linkedinId: profile.id }
                ]
            });

            if (existingUser) {
                console.log('LinkedIn OAuth - Existing user found');
                if (!existingUser.linkedinId) {
                    existingUser.linkedinId = profile.id;
                    await existingUser.save();
                }
                return done(null, existingUser);
            }

            console.log('LinkedIn OAuth - Creating new user');
            const newUser = new User({
                fullName: profile.displayName || 'LinkedIn User',
                userName: await generateUniqueUsername(profile.displayName || 'linkedinuser'),
                email: profile.emails?.[0]?.value || '',
                hashedPassword: 'oauth_user',
                profilepic: profile.photos?.[0]?.value || '',
                linkedinId: profile.id,
            });

            const savedUser = await newUser.save();
            await createUserBoard(savedUser._id);

            console.log('LinkedIn OAuth - New user created:', savedUser._id);
            return done(null, savedUser);
        } catch (error) {
            console.error('LinkedIn OAuth Error:', error);
            return done(error, null);
        }
    }));
    console.log('✅ LinkedIn OAuth strategy configured');
} else {
    console.log('⚠️ LinkedIn OAuth strategy skipped - missing credentials');
}

// Helper function to generate unique username
async function generateUniqueUsername(displayName) {
    try {
        let baseUsername = displayName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 15) || 'user';
        
        let username = baseUsername;
        let counter = 1;
        
        while (await User.findOne({ userName: username })) {
            username = `${baseUsername}${counter}`;
            counter++;
            if (counter > 1000) {
                username = `user${Date.now()}`;
                break;
            }
        }
        
        return username;
    } catch (error) {
        console.error('Username generation error:', error);
        return `user${Date.now()}`;
    }
}

// Helper function to create user board
async function createUserBoard(userId) {
    try {
        const existingBoard = await Board.findOne({ user: userId });
        if (existingBoard) {
            console.log('Board already exists for user:', userId);
            return existingBoard;
        }

        const newBoard = new Board({
            user: userId,
            bio: '',
            location: '',
            website: '',
            socialStats: {
                followers: 0,
                following: 0,
                posts: 0
            },
            interests: []
        });
        
        const savedBoard = await newBoard.save();
        console.log('Board created for user:', userId);
        return savedBoard;
    } catch (error) {
        console.error('Board creation error:', error);
    }
}

passport.serializeUser((user, done) => {
    console.log('Serializing user:', user._id);
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        console.log('Deserializing user:', id);
        const user = await User.findById(id);
        if (!user) {
            console.log('User not found during deserialization:', id);
            return done(null, false);
        }
        done(null, user);
    } catch (error) {
        console.error('Deserialization error:', error);
        done(error, null);
    }
});

export default passport;