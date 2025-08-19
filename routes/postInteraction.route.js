import express from "express";
import { 
    toggleLike, 
    toggleDislike, 
    getUserPostInteraction,
    trackPostView,
    trackMultiplePostViews,
    getPostAnalytics,
    viewTrackingRateLimit // Import from controller, not middleware
} from "../controllers/postInteraction.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// View tracking routes (with rate limiting)
router.post("/:postId/view", viewTrackingRateLimit, trackPostView);
router.post("/batch-views", viewTrackingRateLimit, trackMultiplePostViews);

// Interaction routes
router.post("/:postId/like", toggleLike);
router.post("/:postId/dislike", toggleDislike);

// Status and analytics routes
router.get("/:postId/status", getUserPostInteraction);
router.get("/:postId/analytics", getPostAnalytics);

export default router;