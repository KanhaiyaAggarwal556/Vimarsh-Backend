import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import passport from "./config/Passport.js";
import connectDb from "./utils/connectDB.js";

// Route imports
import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import postRouter from "./routes/post.route.js";
import postInteractionRouter from "./routes/postInteraction.route.js";
import commentRouter from "./routes/comment.route.js";
import boardRouter from "./routes/board.route.js";

dotenv.config();

const app = express();

// Trust proxy (important for production with reverse proxies)
app.set("trust proxy", 1);

// ============ MIDDLEWARE CONFIGURATION ============

// CORS configuration - MUST BE BEFORE ROUTES
// ============ CORS CONFIGURATION - ENHANCED ============
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        "http://localhost:5173",  // Vite default
        "http://localhost:3000",  // React default
        "http://127.0.0.1:5173",  // Alternative localhost
        "http://127.0.0.1:3000",
        process.env.CLIENT_URL,
      ].filter(Boolean); // Remove undefined values
      
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      console.log("CORS blocked origin:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "Cookie", 
      "X-Requested-With",
      "Accept",
      "Origin"
    ],
    exposedHeaders: ["Set-Cookie"],
    preflightContinue: false,
    optionsSuccessStatus: 204
  })
);

// Add preflight handling for all routes
// app.options('*', cors());

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    console.log('Origin:', req.get('Origin'));
    console.log('User-Agent:', req.get('User-Agent'));
    next();
});

// Body parser middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parser middleware
app.use(cookieParser());

// Session configuration (for OAuth)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-very-secure-session-secret-change-this",
    resave: false,
    saveUninitialized: false,
    name: "sessionId",
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URL || "mongodb://localhost:27017/vimarsh",
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

// Passport middleware (for OAuth) - FIXED
app.use(passport.initialize());
app.use(passport.session()); // REMOVED the '/auth' prefix - this was the critical bug

// ============ DEBUG MIDDLEWARE (DEVELOPMENT ONLY) ============

if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        
        const cookieNames = req.cookies ? Object.keys(req.cookies) : [];
        if (cookieNames.length > 0) {
            console.log("Cookies present:", cookieNames);
        }
        
        if (req.cookies && req.cookies.accessToken) {
            console.log("Access token present");
        }
        
        next();
    });
}

// ============ HEALTH CHECK ENDPOINTS ============

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    session: !!req.sessionID,
    user: !!req.user,
    cookies: req.cookies ? Object.keys(req.cookies) : [],
  });
});

// Test endpoint to check cookies (development only)
if (process.env.NODE_ENV === 'development') {
    app.get("/test-cookies", (req, res) => {
        res.json({
            cookies: req.cookies,
            headers: req.headers.cookie,
            session: req.sessionID,
            user: req.user ? { id: req.user._id, email: req.user.email } : null
        });
    });
}

// ============ ROUTE MOUNTING ============

// Authentication routes (includes OAuth and password reset)
app.use("/auth", authRouter);

// User management routes
app.use("/users", userRouter);

// Content routes
app.use("/posts", postRouter);
app.use("/post-interactions", postInteractionRouter);
app.use("/comments", commentRouter);
app.use("/boards", boardRouter);

// ============ ERROR HANDLING ============

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableRoutes: [
            "GET /health",
            "POST /auth/register",
            "POST /auth/login",
            "GET /auth/me",
            "GET /auth/google",
            "GET /users",
            "GET /posts",
        ]
    });
});

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error("Global error handler:", {
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });
    
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal server error",
        error: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
});

// ============ SERVER STARTUP ============

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.listen(PORT, () => {
    connectDb();
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📱 Client URL: ${CLIENT_URL}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log("\n📍 Available endpoints:");
    console.log(`  Health check: http://localhost:${PORT}/health`);
    console.log(`  Auth routes: http://localhost:${PORT}/auth/*`);
    console.log(`  User routes: http://localhost:${PORT}/users/*`);
    console.log(`  Post routes: http://localhost:${PORT}/posts/*`);
    console.log("\n🔐 Authentication endpoints:");
    console.log(`  Register: POST /auth/register`);
    console.log(`  Login: POST /auth/login`);
    console.log(`  Current user: GET /auth/me`);
    console.log(`  Google OAuth: GET /auth/google`);
    console.log(`  Password reset: POST /auth/forgot-password`);
    
    if (process.env.NODE_ENV === 'development') {
        console.log(`  Test cookies: http://localhost:${PORT}/test-cookies`);
        console.log(`  Debug session: http://localhost:${PORT}/auth/debug-session`);
    }
});
