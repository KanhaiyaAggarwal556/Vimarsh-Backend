// board.route.js - CORRECTED (removing undefined functions)
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

// ✅ CORRECTED ORDER: Only using functions that actually exist

// 1. Static routes (no parameters) - MUST BE FIRST
router.get("/test", test);                                   
router.get("/search", searchBoards);                         

// 2. CREATE
router.post("/", createBoard);

// 3. READ - Base route
router.get("/", getAllBoards);                           

// 4. User-specific routes (specific structure)
router.get("/user/:userId", getBoardsByUser);            
router.get("/user/:userId/bookmarks", getUserBookmarks); 
router.get("/user/:userId/followers", getFollowers);     
router.get("/user/:userId/following", getFollowing);     
// REMOVED: router.get("/user/:userId/stats", getUserBoardStats); - function doesn't exist
router.delete("/user/:userId", deleteBoardsByUser);      

// 5. Location/Interest routes (consider changing to query params)
router.get("/location/:location", getAllBoards);         
router.get("/interests/:interest", getAllBoards);        

// 6. Follow/unfollow routes
router.post("/follow/:targetUserId", followUser);        
router.post("/unfollow/:targetUserId", unfollowUser);    
router.get("/follow-status/:currentUserId/:targetUserId", checkFollowStatus); 

// 7. Routes with additional path segments (more specific than /:id)
router.patch("/:id/social-stats", updateSocialStats);    
router.patch("/:id/social-increment", updateSocialStatsIncrement); 
router.post("/:id/bookmark/:postId", addBookmark);       
router.delete("/:id/bookmark/:postId", removeBookmark);  

// 8. LAST: Single parameter routes (most general)
router.get("/:id", getBoardById);                        
router.put("/:id", updateBoard);                          
router.delete("/:id", deleteBoard);                      

export default router;