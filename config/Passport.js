// ============ FILE 8: config/passport.js (REFACTORED) ============
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';
import { handleOAuthUser } from '../utils/oauthUtils.js';
import User from '../models/user.model.js';
import dotenv from 'dotenv';

dotenv.config();

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
}

// Helper function for callback URLs
const getCallbackURL = (provider) => {
    const baseURL = process.env.SERVER_URL || 'http://localhost:4000';
    return `${baseURL}/auth/${provider}/callback`; // Remove /api, use /auth
};

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: getCallbackURL('google')
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const user = await handleOAuthUser(profile, 'Google');
            return done(null, user);
        } catch (error) {
            console.error('Google OAuth Error:', error);
            return done(error, null);
        }
    }));
    console.log('✅ Google OAuth strategy configured');
} else {
    console.log('⚠️ Google OAuth strategy skipped - missing credentials');
}

// Facebook OAuth Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: getCallbackURL('facebook'),
        profileFields: ['id', 'displayName', 'emails', 'photos']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const user = await handleOAuthUser(profile, 'Facebook');
            return done(null, user);
        } catch (error) {
            console.error('Facebook OAuth Error:', error);
            return done(error, null);
        }
    }));
    console.log('✅ Facebook OAuth strategy configured');
} else {
    console.log('⚠️ Facebook OAuth strategy skipped - missing credentials');
}

// LinkedIn OAuth Strategy (Updated for v2 API)
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    passport.use(new LinkedInStrategy({
        clientID: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackURL: getCallbackURL('linkedin'),
        scope: ['openid', 'profile', 'email'], // Updated scopes for v2 API
        state: true
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const user = await handleOAuthUser(profile, 'LinkedIn');
            return done(null, user);
        } catch (error) {
            console.error('LinkedIn OAuth Error:', error);
            return done(error, null);
        }
    }));
    console.log('✅ LinkedIn OAuth strategy configured');
} else {
    console.log('⚠️ LinkedIn OAuth strategy skipped - missing credentials');
}

passport.serializeUser((user, done) => {
    console.log('Serializing user:', user._id);
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
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