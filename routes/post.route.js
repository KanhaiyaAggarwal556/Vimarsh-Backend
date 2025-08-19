// Updated post.route.js
import express from "express";
import {
  getAllPosts,
  getInfinitePosts,
  getInfinitePostsSeeded, // NEW: Seeded randomization version
  getInfinitePostsCursor,
  getRandomPosts,
  getPostById,
  getPostsByUserId,
  getRecentPosts,
  getTrendingPosts,
  getUserAnalytics,
  getUserPostInteractions,
} from "../controllers/post.controller.js";

import { authenticateToken, optionalAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// IMPORTANT: Order matters! Most specific routes FIRST

// 1. Static routes (no parameters) - THESE MUST COME FIRST
router.get("/", optionalAuth, getAllPosts);
router.get("/infinite", optionalAuth, getInfinitePosts); // Simplified $sample approach
router.get("/infinite-seeded", optionalAuth, getInfinitePostsSeeded); // Seeded randomization approach
router.get("/infinite-cursor", optionalAuth, getInfinitePostsCursor);
router.get("/random", optionalAuth, getRandomPosts); // This one should work fine
router.get("/recent", optionalAuth, getRecentPosts);
router.get("/trending", optionalAuth, getTrendingPosts);

// 2. User-specific routes with parameters but specific structure
router.get("/user/:userId", optionalAuth, getPostsByUserId);
router.get("/analytics/user/:userId", getUserAnalytics);

// 3. Post-specific routes with additional path segments
router.get("/:postId/interactions", authenticateToken, getUserPostInteractions);

// 4. LAST: Single parameter routes (most general)
router.get("/:id", optionalAuth, getPostById);

export default router;