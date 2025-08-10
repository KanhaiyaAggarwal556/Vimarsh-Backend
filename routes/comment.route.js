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

// Test route
router.get("/test", test);

// CREATE
router.post("/", createComment);

// READ - IMPORTANT: More specific routes should come BEFORE generic ones
router.get("/post/:postId", getCommentsByPost);     // Get all comments for a specific post - MOVED UP
router.get("/", getAllComments);                    // Get all comments with filtering & pagination
router.get("/:id", getCommentById);                 // Get single comment by ID - MOVED DOWN

// UPDATE
router.put("/:id", updateComment);                  // Update comment body
router.patch("/:id/reactions", updateCommentReactions); // Update likes/dislikes

export default router;