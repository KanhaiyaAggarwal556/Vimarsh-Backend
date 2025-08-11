// app.js or server.js - FIXED configuration
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import cookieParser from "cookie-parser";
import userRouter from "./routes/user.route.js";
import postRouter from "./routes/post.route.js";
import commentRouter from "./routes/comment.route.js";
import boardRouter from "./routes/board.route.js";
import authRouter from "./routes/auth.route.js";
import connectDb from "./utils/connectDB.js";
import cors from "cors";
import passport from "./config/Passport.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Trust proxy (important for production with reverse proxies)
app.set("trust proxy", 1);

// IMPORTANT: CORS MUST BE BEFORE ROUTES - FIXED ORDER AND ORIGINS
app.use(
  cors({
    origin: [
      process.env.CLIENT_URL || "http://localhost:5173", // CHANGED FROM 3000 TO 5173
      // "http://localhost:5173", // Vite dev server
      // "http://localhost:3000", // React dev server (backup)
      // "http://127.0.0.1:5173", // Alternative localhost
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Cookie parser middleware
app.use(cookieParser());

// Body parser middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Session configuration
app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "your-very-secure-session-secret-change-this",
    resave: false,
    saveUninitialized: false,
    name: "sessionId",
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URL || "mongodb://localhost:27017/vimarsh", // FIXED: Use MONGO_URL from your env
      touchAfter: 24 * 3600,
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware for cookies and authentication
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  console.log(
    "Cookies:",
    req.cookies ? Object.keys(req.cookies) : "No cookies"
  );
  if (req.cookies && req.cookies.accessToken) {
    console.log("Access token present");
  }
  next();
});

// Health check endpoint (before routes)
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    session: !!req.sessionID,
    user: !!req.user,
    cookies: req.cookies ? Object.keys(req.cookies) : [],
  });
});

// Test endpoint to check cookies
app.get("/test-cookies", (req, res) => {
  res.json({
    cookies: req.cookies,
    headers: req.headers.cookie,
  });
});

// Debug middleware for OAuth
app.use("/auth", (req, res, next) => {
  console.log(`OAuth Route: ${req.method} ${req.path}`);
  console.log("Session ID:", req.sessionID);
  console.log("User authenticated:", !!req.user);
  next();
});

// FIXED: Single route mounting - Remove duplicates
app.use("/users", userRouter);
app.use("/posts", postRouter); // This matches your frontend calls
app.use("/comments", commentRouter);
app.use("/boards", boardRouter);
app.use("/auth", authRouter);

app.use("/api/posts", postRouter);    // For API calls with /api prefix
app.use("/api/users", userRouter);  
// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  connectDb();
  console.log(`Server is started on port ${PORT}`);
  console.log("Available endpoints:");
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  Test cookies: http://localhost:${PORT}/test-cookies`);
  console.log(`  Google OAuth: http://localhost:${PORT}/auth/google`);
  console.log(`  Facebook OAuth: http://localhost:${PORT}/auth/facebook`);
  console.log(`  LinkedIn OAuth: http://localhost:${PORT}/auth/linkedin`);
  console.log(`  User status: http://localhost:${PORT}/auth/user`);
  console.log(`  Posts API: http://localhost:${PORT}/api/posts`);
  console.log(`  Users API: http://localhost:${PORT}/api/users`);
  console.log(`  Login: POST http://localhost:${PORT}/api/users/auth/login`);
  console.log(`  Register: POST http://localhost:${PORT}/api/users/auth/register`);
  console.log(`  Logout: POST http://localhost:${PORT}/api/users/auth/logout`);
});