// ===== FIXED: post.route.js =====
import express from "express";
import {
  getAllPosts,
  getPostById,
  getPostsByUserId,
  getRecentPosts,
  getTrendingPosts,
  getUserAnalytics,
  getUserPostInteractions,
} from "../controllers/post.controller.js";
import { authenticateToken, optionalAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// FIXED ORDER: Most specific routes FIRST, parameterized routes LAST

// 1. Static routes (no parameters) - THESE MUST COME FIRST
router.get("/", optionalAuth, getAllPosts);
router.get("/recent", optionalAuth, getRecentPosts);
router.get("/trending", optionalAuth, getTrendingPosts);

// 2. Multi-segment specific routes
// 3. User-specific routes with parameters but specific structure
router.get("/user/:userId", optionalAuth, getPostsByUserId);
router.get("/analytics/user/:userId", getUserAnalytics);

// 4. Post-specific routes with additional path segments - MOVED UP
router.get("/:postId/interactions", authenticateToken, getUserPostInteractions);
// 5. LAST: Single parameter routes (most general) - MOVED TO END
router.get("/:id", optionalAuth, getPostById);

export default router;