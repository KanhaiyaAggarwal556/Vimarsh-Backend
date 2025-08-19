export const JWT_CONFIG = {
    ACCESS_TOKEN_SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    REFRESH_TOKEN_SECRET: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
    ACCESS_TOKEN_EXPIRY: '10d',
    REFRESH_TOKEN_EXPIRY: '10d',
    INACTIVITY_PERIOD_DAYS: 10,
    ACTIVITY_UPDATE_THRESHOLD: 30 * 60 * 1000,
};
export const getCookieOptions = (isProduction = process.env.NODE_ENV === 'production') => ({
    
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'none', // Fixed for cross-origin dev
    maxAge: 15 * 24 * 60 * 60 * 1000, // 15 days
});