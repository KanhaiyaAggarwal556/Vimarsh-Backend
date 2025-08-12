// Fixed post.route.js - Correct Route Order
import express from "express";
import {
  getAllPosts,
  getPostById,
  getPostsByUserId,
  getRecentPosts,
  getTrendingPosts,
  getUserAnalytics,
  updatePostReaction,
  incrementPostViews,
  getUserPostInteractions,
  getUserSavedPosts
} from "../controllers/post.controller.js";
import { authenticateToken, optionalAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// ✅ FIXED ORDER: Static routes FIRST, parameterized routes LAST

// 1. Static routes (no parameters) - MUST BE FIRST
router.get("/", optionalAuth, getAllPosts);
router.get("/recent", optionalAuth, getRecentPosts);           // MOVED UP - was conflicting with /:id
router.get("/trending", optionalAuth, getTrendingPosts);       // MOVED UP - was conflicting with /:id

// 2. Multi-word static routes
router.get("/saved/user", authenticateToken, getUserSavedPosts); // MOVED UP - was conflicting with /:postId/interactions

// 3. User-specific routes (specific structure)
router.get("/user/:userId", optionalAuth, getPostsByUserId);
router.get("/analytics/user/:userId", getUserAnalytics);

// 4. Post-specific routes with additional segments
router.get("/:postId/interactions", authenticateToken, getUserPostInteractions);
router.post("/:postId/reaction", authenticateToken, updatePostReaction);
router.post("/:postId/views", optionalAuth, incrementPostViews);

// 5. LAST: Single parameter routes (most general)
router.get("/:id", optionalAuth, getPostById);                // MOVED TO END

export default router;