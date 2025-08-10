import express from "express";
import { 
    test,
    createBoard,
    getAllBoards,
    getBoardById,
    getBoardsByUser,
    updateBoard,
    updateSocialStats,
    updateSocialStatsIncrement,
    deleteBoard,
    deleteBoardsByUser,
    searchBoards,
    addBookmark,
    removeBookmark,
    getUserBookmarks,
    followUser,
    unfollowUser,
    getFollowers,
    getFollowing,
    checkFollowStatus,
} from "../controllers/board.controller.js";

const router = express.Router();

// Test route
router.get("/test", test);

// CREATE routes
router.post("/", createBoard);

// READ routes
router.get("/", getAllBoards);                           // Get all boards with pagination & filtering
router.get("/search", searchBoards);                     // Search boards by query (bio, interests, location)
router.get("/:id", getBoardById);                        // Get specific board by ID with populated user & bookmarks
router.get("/user/:userId", getBoardsByUser);            // Get all boards by user ID with pagination
router.get("/user/:userId/bookmarks", getUserBookmarks); // Get user's bookmarked posts (flattened from all boards)

// NEW FOLLOW/UNFOLLOW routes
router.post("/follow/:targetUserId", followUser);        // Follow a user (send currentUserId in body)
router.post("/unfollow/:targetUserId", unfollowUser);    // Unfollow a user (send currentUserId in body)
router.get("/user/:userId/followers", getFollowers);     // Get user's followers with pagination
router.get("/user/:userId/following", getFollowing);     // Get user's following with pagination
router.get("/follow-status/:currentUserId/:targetUserId", checkFollowStatus); // Check if currentUser follows targetUser

// UPDATE routes
router.put("/:id", updateBoard);                         // Update board (coverPhoto, bio, website, interests, location)
router.patch("/:id/social-stats", updateSocialStats);    // Update social stats directly (followers, following, posts)
router.patch("/:id/social-increment", updateSocialStatsIncrement); // Increment/decrement social stats

// BOOKMARK routes (Post management)
router.post("/:id/bookmark/:postId", addBookmark);       // Add post to board bookmarks
router.delete("/:id/bookmark/:postId", removeBookmark);  // Remove post from board bookmarks

// DELETE routes
router.delete("/:id", deleteBoard);                      // Delete specific board by ID
router.delete("/user/:userId", deleteBoardsByUser);      // Delete all boards by user ID

// BULK operations
router.get("/location/:location", getAllBoards);         // Get boards by location (use query param instead)
router.get("/interests/:interest", getAllBoards);        // Get boards by interest (use query param instead)

// STATISTICS routes (optional additions)
// router.get("/stats/overview", getBoardStats);         // Get general board statistics
// router.get("/user/:userId/stats", getUserBoardStats); // Get user's board statistics

// VALIDATION routes (optional additions)
// router.post("/validate/website", validateWebsite);    // Validate website URL format
// router.post("/validate/interests", validateInterests); // Validate interests array

export default router;