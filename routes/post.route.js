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

// Public routes with optional auth (to get user interaction data if available)
router.get("/", optionalAuth, getAllPosts);
router.get("/recent", optionalAuth, getRecentPosts);
router.get("/trending", optionalAuth, getTrendingPosts);
router.get("/:id", optionalAuth, getPostById);
router.get("/user/:userId", optionalAuth, getPostsByUserId);
router.get("/analytics/user/:userId", getUserAnalytics);

// Protected routes (authentication required)
router.post("/:id/reaction", authenticateToken, updatePostReaction);
router.post("/:id/views", optionalAuth, incrementPostViews);
router.get("/:id/interactions", authenticateToken, getUserPostInteractions);

// New route for getting user's saved posts
router.get("/saved/user", authenticateToken, getUserSavedPosts);

export default router;