import express from "express";
import { 
    toggleLike, 
    toggleDislike, 
    getUserPostInteraction 
} from "../controllers/postInteraction.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js"; // Using your existing auth

const router = express.Router();

// All routes require authentication using your existing middleware
router.use(authenticateToken);

// Like/Dislike routes
router.post("/:postId/like", toggleLike);
router.post("/:postId/dislike", toggleDislike);

// Get user interaction status
router.get("/:postId/status", getUserPostInteraction);

export default router;