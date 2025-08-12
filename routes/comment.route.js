// Fixed comment.route.js - Correct Route Order
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

// ✅ FIXED ORDER: Static routes FIRST, parameterized routes LAST

// 1. Static routes first
router.get("/test", test);                          // MOVED UP - was conflicting with /:id

// 2. CREATE
router.post("/", createComment);

// 3. READ - Static and multi-segment routes first
router.get("/", getAllComments);                    
router.get("/post/:postId", getCommentsByPost);     

// 4. UPDATE - Routes with additional path segments
router.patch("/:id/reactions", updateCommentReactions); // MOVED UP - more specific than /:id

// 5. LAST: Single parameter routes (most general)
router.get("/:id", getCommentById);                 // MOVED TO END
router.put("/:id", updateComment);                  // MOVED TO END

export default router;