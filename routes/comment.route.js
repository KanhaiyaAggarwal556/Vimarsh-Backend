// Updated comment.route.js - Simplified for likes only
import express from "express";
import {
    test,
    createComment,
    getAllComments,
    getCommentsByPost,
    getCommentById,
    updateComment,
    updateCommentReactions
} from "../controllers/comment.controller.js";

const router = express.Router();

// ✅ CORRECT ORDER: Static routes FIRST, parameterized routes LAST

// 1. Static routes first
router.get("/test", test);

// 2. CREATE
router.post("/", createComment);

// 3. READ - Static and multi-segment routes first
router.get("/", getAllComments);                    
router.get("/post/:postId", getCommentsByPost);     

// 4. UPDATE - Routes with additional path segments
router.patch("/:id/like", updateCommentReactions); // Updated endpoint name for clarity

// 5. LAST: Single parameter routes (most general)
router.get("/:id", getCommentById);                 
router.put("/:id", updateComment);                  

export default router;