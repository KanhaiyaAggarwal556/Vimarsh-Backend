import express from "express";
import {
    createUser,
    getAllUsers,
    getUserById,
    getUserByUsername,
    getUserByEmail,
    loginUser,
    logoutUser,
    getCurrentUser,
    refreshToken
} from "../controllers/user.controller.js";
import { authenticateToken, optionalAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Public authentication routes
router.post("/auth/create", createUser);
router.post("/auth/login", loginUser);
router.post("/auth/logout", logoutUser);
router.post("/auth/refresh", refreshToken);

// Protected routes - require authentication
router.get("/auth/me", authenticateToken, getCurrentUser);

// User retrieval routes - with optional authentication
router.get("/", optionalAuth, getAllUsers);
router.get("/username/:username", optionalAuth, getUserByUsername);
router.get("/email/:email", optionalAuth, getUserByEmail);
router.get("/:id", optionalAuth, getUserById);

export default router;