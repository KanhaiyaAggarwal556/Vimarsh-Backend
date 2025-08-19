// utils/tokenUtils.js
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/jwt.config.js';

export const generateToken = (userId, type = 'access') => {
    const secret = type === 'refresh' ? JWT_CONFIG.REFRESH_TOKEN_SECRET : JWT_CONFIG.ACCESS_TOKEN_SECRET;
    const expiresIn = type === 'refresh' ? JWT_CONFIG.REFRESH_TOKEN_EXPIRY : JWT_CONFIG.ACCESS_TOKEN_EXPIRY;
    
    const payload = { 
        userId,
        iat: Math.floor(Date.now() / 1000) // Include issued at time
    };
    
    if (type === 'refresh') {
        payload.type = 'refresh';
    }
    
    return jwt.sign(payload, secret, { expiresIn });
};

export const verifyToken = (token, type = 'access') => {
    const secret = type === 'refresh' ? JWT_CONFIG.REFRESH_TOKEN_SECRET : JWT_CONFIG.ACCESS_TOKEN_SECRET;
    return jwt.verify(token, secret);
};

export const setTokenCookies = (res, accessToken, refreshToken) => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Calculate cookie expiry based on inactivity period
    const cookieMaxAge = JWT_CONFIG.INACTIVITY_PERIOD_DAYS * 24 * 60 * 60 * 1000; // 10 days in milliseconds
    
    // Access Token Cookie - shorter expiry for security
    const accessCookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: cookieMaxAge, // 15 minutes (matching ACCESS_TOKEN_EXPIRY)
        path: '/'
    };
    
    // Refresh Token Cookie - matches inactivity period
    const refreshCookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: cookieMaxAge, // 10 days (matching INACTIVITY_PERIOD_DAYS)
        path: '/'
    };
    
    // Set cookies
    res.cookie('accessToken', accessToken, accessCookieOptions);
    res.cookie('refreshToken', refreshToken, refreshCookieOptions);
    
    // Debug logging
    console.log('🍪 Tokens set in cookies:', {
        accessToken: !!accessToken,
        refreshToken: !!refreshToken,
        accessExpiry: new Date(Date.now() + accessCookieOptions.maxAge),
        refreshExpiry: new Date(Date.now() + refreshCookieOptions.maxAge),
        inactivityPeriod: `${JWT_CONFIG.INACTIVITY_PERIOD_DAYS} days`,
        isProduction
    });
};

export const clearTokenCookies = (res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    const clearOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: '/'
    };
    
    res.clearCookie('accessToken', clearOptions);
    res.clearCookie('refreshToken', clearOptions);
    
    console.log('🗑️ Auth cookies cleared');
};

// Helper function to check if user session should expire due to inactivity
export const isSessionExpiredDueToInactivity = (lastActivity) => {
    if (!lastActivity) return true;
    
    const inactivityThreshold = new Date(Date.now() - JWT_CONFIG.INACTIVITY_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    return new Date(lastActivity) < inactivityThreshold;
};

// Helper function to check if activity should be updated
export const shouldUpdateActivity = (lastActivity) => {
    if (!lastActivity) return true;
    
    const updateThreshold = new Date(Date.now() - JWT_CONFIG.ACTIVITY_UPDATE_THRESHOLD);
    return new Date(lastActivity) < updateThreshold;
};

// Utility to get standardized cookie options
export const getCookieOptions = (maxAge = null) => {
    const isProduction = process.env.NODE_ENV === 'production';
    
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: maxAge || (JWT_CONFIG.INACTIVITY_PERIOD_DAYS * 24 * 60 * 60 * 1000),
        path: '/'
    };
};