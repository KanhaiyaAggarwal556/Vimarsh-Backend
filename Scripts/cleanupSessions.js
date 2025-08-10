// scripts/cleanupSessions.js
import User from "../models/user.model.js";
import connectDb from "../utils/connectDB.js";
import dotenv from "dotenv";

dotenv.config();

// Function to cleanup expired user sessions
const cleanupExpiredSessions = async () => {
    try {
        console.log('Starting session cleanup...');
        
        // Connect to database
        await connectDb();
        
        // Calculate cutoff date (15 days ago)
        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
        
        // Find users with expired sessions
        const expiredUsers = await User.find({
            lastLogin: { $lt: fifteenDaysAgo },
            isActive: true
        });
        
        console.log(`Found ${expiredUsers.length} users with expired sessions`);
        
        if (expiredUsers.length > 0) {
            // Optional: You could delete these users or just mark them as inactive
            // For now, let's just log them
            
            for (const user of expiredUsers) {
                console.log(`User ${user.userName} (${user.email}) - Last login: ${user.lastLogin}`);
            }
            
            // Uncomment below if you want to mark them as inactive
            /*
            const result = await User.updateMany(
                { lastLogin: { $lt: fifteenDaysAgo }, isActive: true },
                { isActive: false }
            );
            console.log(`Marked ${result.modifiedCount} users as inactive`);
            */
        }
        
        console.log('Session cleanup completed');
        process.exit(0);
        
    } catch (error) {
        console.error('Error during session cleanup:', error);
        process.exit(1);
    }
};

// Run cleanup if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    cleanupExpiredSessions();
}

export default cleanupExpiredSessions;

// You can also set up automatic cleanup with a cron job
// Add this to your main app.js if you want automatic cleanup every day at midnight:
/*
import cron from 'node-cron';

// Run cleanup every day at midnight
cron.schedule('0 0 * * *', () => {
    console.log('Running daily session cleanup...');
    cleanupExpiredSessions();
});
*/