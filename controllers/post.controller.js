import Post from "../models/post.model.js";
import UserPostInteraction from "../models/UserPostInteraction.model.js";
import mongoose from "mongoose";

export const getInfinitePosts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 5,
      sortBy = "createdAt",
      sortOrder = "desc",
      seed,
      tags,
      location,
      search,
      isFirstLoad = false,
    } = req.query;

    const filter = {};

    // Apply filters
    if (tags) {
      filter.tags = { $in: tags.split(",") };
    }

    if (location) {
      filter.location = new RegExp(location, "i");
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    const batchSize = isFirstLoad === "true" ? 20 : parseInt(limit);
    let randomSeed;
    
    if (seed && seed !== "null" && seed !== "undefined") {
      const cleanSeed = seed.toString().replace(/[^0-9]/g, '');
      randomSeed = parseInt(cleanSeed) || Math.floor(Math.random() * 1000000);
    } else {
      randomSeed = Math.floor(Math.random() * 1000000);
    }

    let posts;
    let totalPosts;

    // Handle random sorting - using $sample for simplicity
    if (sortBy === "random" || !sortBy || sortBy === "createdAt") {
      totalPosts = await Post.countDocuments(filter);
      
      if (totalPosts === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            currentPage: 1,
            totalPages: 0,
            totalPosts: 0,
            hasNext: false,
            hasPrev: false,
            batchSize: 0,
            loadedPosts: 0,
          },
          hasNextPage: false,
          nextPage: null,
          seed: randomSeed.toString(),
          isFirstLoad: isFirstLoad === "true",
        });
      }

      // Use $sample with smart sizing
      const sampleSize = Math.min(
        Math.max(batchSize * 3, 50),
        Math.min(totalPosts, 500)
      );

      const pipeline = [
        { $match: filter },
        { $sample: { size: sampleSize } },
      ];

      // Pagination simulation on random results
      const skip = (parseInt(page) - 1) * batchSize;
      if (skip > 0) {
        pipeline.push({ $skip: skip });
      }
      
      pipeline.push(
        { $limit: batchSize },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
            pipeline: [
              { $project: { userName: 1, fullName: 1, profilepic: 1 } },
            ],
          },
        },
        { $unwind: "$user" }
      );

      posts = await Post.aggregate(pipeline);
      
    } else {
      // Regular sorting for other sort options
      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;
      const skip = (parseInt(page) - 1) * batchSize;

      posts = await Post.find(filter)
        .populate("user", "userName fullName profilepic")
        .sort(sort)
        .skip(skip)
        .limit(batchSize);

      totalPosts = await Post.countDocuments(filter);
    }

    // Add user interactions
    let postsWithInteractions = [];
    if (req.userId && posts.length > 0) {
      const postIds = posts.map((post) => post._id);
      const userInteractions = await UserPostInteraction.find({
        user: req.userId,
        post: { $in: postIds },
      });

      const interactionMap = {};
      userInteractions.forEach((interaction) => {
        interactionMap[interaction.post.toString()] = {
          liked: interaction.liked,
          disliked: interaction.disliked,
          saved: interaction.saved,
          viewed: interaction.viewed,
        };
      });

      postsWithInteractions = posts.map((post) => ({
        ...post,
        userInteraction: interactionMap[post._id.toString()] || {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    } else {
      postsWithInteractions = posts.map((post) => ({
        ...post,
        userInteraction: {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    }

    // Calculate pagination info
    const currentBatchSize = isFirstLoad === "true" ? 20 : parseInt(limit);
    const skip = (parseInt(page) - 1) * batchSize;
    const effectivePage = parseInt(page);
    const totalPages = Math.ceil(totalPosts / currentBatchSize);
    
    const hasNext = sortBy === "random" 
      ? posts.length === batchSize && (skip + batchSize) < Math.min(totalPosts, 500)
      : skip + batchSize < totalPosts;

    res.status(200).json({
      success: true,
      data: postsWithInteractions,
      pagination: {
        currentPage: effectivePage,
        totalPages,
        totalPosts,
        hasNext,
        hasPrev: effectivePage > 1,
        batchSize: posts.length,
        loadedPosts: skip + posts.length,
      },
      hasNextPage: hasNext,
      nextPage: hasNext ? effectivePage + 1 : null,
      seed: randomSeed.toString(),
      isFirstLoad: isFirstLoad === "true",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching posts",
      error: error.message,
    });
  }
};

export const getInfinitePostsCursor = async (req, res) => {
  try {
    const {
      limit = 5,
      cursor,
      seed,
      tags,
      location,
      search,
      isFirstLoad = false,
    } = req.query;

    const filter = {};

    if (tags) {
      filter.tags = { $in: tags.split(",") };
    }

    if (location) {
      filter.location = new RegExp(location, "i");
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    const batchSize = isFirstLoad === "true" ? 20 : parseInt(limit);

    let randomSeed;
    if (seed && seed !== "null" && seed !== "undefined") {
      const cleanSeed = seed.toString().replace(/[^0-9]/g, '');
      randomSeed = parseInt(cleanSeed) || Math.floor(Math.random() * 1000000);
    } else {
      randomSeed = Math.floor(Math.random() * 1000000);
    }

    // For first load, use $sample
    if (!cursor || isFirstLoad === "true") {
      const posts = await Post.aggregate([
        { $match: filter },
        { $sample: { size: batchSize * 2 } },
        { $limit: batchSize },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
            pipeline: [{ $project: { userName: 1, fullName: 1, profilepic: 1 } }],
          },
        },
        { $unwind: "$user" },
      ]);

      const hasNextPage = posts.length === batchSize;
      const nextCursor = posts.length > 0 ? posts[posts.length - 1]._id : null;

      // Add user interactions
      let postsWithInteractions = [];
      if (req.userId && posts.length > 0) {
        const postIds = posts.map((post) => post._id);
        const userInteractions = await UserPostInteraction.find({
          user: req.userId,
          post: { $in: postIds },
        });

        const interactionMap = {};
        userInteractions.forEach((interaction) => {
          interactionMap[interaction.post.toString()] = {
            liked: interaction.liked,
            disliked: interaction.disliked,
            saved: interaction.saved,
            viewed: interaction.viewed,
          };
        });

        postsWithInteractions = posts.map((post) => ({
          ...post,
          userInteraction: interactionMap[post._id.toString()] || {
            liked: false,
            disliked: false,
            saved: false,
            viewed: false,
          },
        }));
      } else {
        postsWithInteractions = posts.map((post) => ({
          ...post,
          userInteraction: {
            liked: false,
            disliked: false,
            saved: false,
            viewed: false,
          },
        }));
      }

      return res.status(200).json({
        success: true,
        data: postsWithInteractions,
        hasNextPage,
        nextCursor,
        seed: randomSeed.toString(),
        isFirstLoad: true,
        batchSize: posts.length,
      });
    }

    // For subsequent pages, use seeded randomization
    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          randomValue: {
            $let: {
              vars: {
                idStr: { $toString: "$_id" },
                dayOfYear: { $dayOfYear: "$createdAt" },
                hour: { $hour: "$createdAt" },
                minute: { $minute: "$createdAt" }
              },
              in: {
                $mod: [
                  {
                    $add: [
                      randomSeed,
                      {
                        $toInt: {
                          $substr: ["$$idStr", -6, -1]
                        }
                      },
                      { $multiply: ["$$dayOfYear", 17] },
                      { $multiply: ["$$hour", 23] },
                      { $multiply: ["$$minute", 31] }
                    ]
                  },
                  999999
                ]
              }
            }
          }
        }
      },
      { $sort: { randomValue: 1, _id: 1 } }
    ];

    if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
      pipeline.push({
        $match: {
          _id: { $gt: new mongoose.Types.ObjectId(cursor) }
        }
      });
    }

    pipeline.push(
      { $limit: batchSize + 1 },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { userName: 1, fullName: 1, profilepic: 1 } }],
        },
      },
      { $unwind: "$user" },
      { $unset: "randomValue" }
    );

    const posts = await Post.aggregate(pipeline);

    const hasNextPage = posts.length > batchSize;
    const resultPosts = hasNextPage ? posts.slice(0, -1) : posts;
    const nextCursor = resultPosts.length > 0 ? resultPosts[resultPosts.length - 1]._id : null;

    // Add user interactions
    let postsWithInteractions = [];
    if (req.userId && resultPosts.length > 0) {
      const postIds = resultPosts.map((post) => post._id);
      const userInteractions = await UserPostInteraction.find({
        user: req.userId,
        post: { $in: postIds },
      });

      const interactionMap = {};
      userInteractions.forEach((interaction) => {
        interactionMap[interaction.post.toString()] = {
          liked: interaction.liked,
          disliked: interaction.disliked,
          saved: interaction.saved,
          viewed: interaction.viewed,
        };
      });

      postsWithInteractions = resultPosts.map((post) => ({
        ...post,
        userInteraction: interactionMap[post._id.toString()] || {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    } else {
      postsWithInteractions = resultPosts.map((post) => ({
        ...post,
        userInteraction: {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    }

    res.status(200).json({
      success: true,
      data: postsWithInteractions,
      hasNextPage,
      nextCursor,
      seed: randomSeed.toString(),
      isFirstLoad: false,
      batchSize: resultPosts.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching posts",
      error: error.message,
    });
  }
};

export const getRandomPosts = async (req, res) => {
  try {
    const {
      limit = 20,
      tags,
      location,
      search,
    } = req.query;

    const filter = {};

    if (tags) {
      filter.tags = { $in: tags.split(",") };
    }

    if (location) {
      filter.location = new RegExp(location, "i");
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    const posts = await Post.aggregate([
      { $match: filter },
      { $sample: { size: parseInt(limit) } },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
          pipeline: [
            { $project: { userName: 1, fullName: 1, profilepic: 1 } },
          ],
        },
      },
      { $unwind: "$user" },
    ]);

    let postsWithInteractions = [];
    if (req.userId && posts.length > 0) {
      const postIds = posts.map((post) => post._id);
      const userInteractions = await UserPostInteraction.find({
        user: req.userId,
        post: { $in: postIds },
      });

      const interactionMap = {};
      userInteractions.forEach((interaction) => {
        interactionMap[interaction.post.toString()] = {
          liked: interaction.liked,
          disliked: interaction.disliked,
          saved: interaction.saved,
          viewed: interaction.viewed,
        };
      });

      postsWithInteractions = posts.map((post) => ({
        ...post,
        userInteraction: interactionMap[post._id.toString()] || {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    } else {
      postsWithInteractions = posts.map((post) => ({
        ...post,
        userInteraction: {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    }

    const totalPosts = await Post.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: postsWithInteractions,
      totalPosts,
      returnedPosts: postsWithInteractions.length,
      isRandom: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching random posts",
      error: error.message,
    });
  }
};
// ALTERNATIVE: Pure seeded randomization using simple hash
export const getInfinitePostsSeeded = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 5,
      seed,
      tags,
      location,
      search,
      isFirstLoad = false,
    } = req.query;

    const filter = {};

    if (tags) {
      filter.tags = { $in: tags.split(",") };
    }

    if (location) {
      filter.location = new RegExp(location, "i");
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    const batchSize = isFirstLoad === "true" ? 20 : parseInt(limit);
    const skip = (parseInt(page) - 1) * batchSize;

    let randomSeed;
    if (seed && seed !== "null" && seed !== "undefined") {
      const cleanSeed = seed.toString().replace(/[^0-9]/g, '');
      randomSeed = parseInt(cleanSeed) || Math.floor(Math.random() * 1000000);
    } else {
      randomSeed = Math.floor(Math.random() * 1000000);
    }

    console.log(`🎲 Using seeded randomization with seed: ${randomSeed}`);

    // Simple seeded randomization using creation time + seed
    const pipeline = [
      { $match: filter },
      {
        $addFields: {
          // Simple hash using timestamp components and seed
          randomValue: {
            $mod: [
              {
                $add: [
                  randomSeed,
                  { $multiply: [{ $dayOfYear: "$createdAt" }, 31] },
                  { $multiply: [{ $hour: "$createdAt" }, 37] },
                  { $multiply: [{ $minute: "$createdAt" }, 41] },
                  { $multiply: [{ $second: "$createdAt" }, 43] },
                  { $multiply: [{ $millisecond: "$createdAt" }, 47] }
                ]
              },
              999999
            ]
          }
        }
      },
      { $sort: { randomValue: 1, _id: 1 } },
      { $skip: skip },
      { $limit: batchSize },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
          pipeline: [
            { $project: { userName: 1, fullName: 1, profilepic: 1 } },
          ],
        },
      },
      { $unwind: "$user" },
      { $unset: "randomValue" }
    ];

    const posts = await Post.aggregate(pipeline);
    console.log(`✅ Seeded randomization: Got ${posts.length} posts`);

    const totalPosts = await Post.countDocuments(filter);

    // Add user interactions (same as above)
    let postsWithInteractions = [];
    if (req.userId && posts.length > 0) {
      const postIds = posts.map((post) => post._id);
      const userInteractions = await UserPostInteraction.find({
        user: req.userId,
        post: { $in: postIds },
      });

      const interactionMap = {};
      userInteractions.forEach((interaction) => {
        interactionMap[interaction.post.toString()] = {
          liked: interaction.liked,
          disliked: interaction.disliked,
          saved: interaction.saved,
          viewed: interaction.viewed,
        };
      });

      postsWithInteractions = posts.map((post) => ({
        ...post,
        userInteraction: interactionMap[post._id.toString()] || {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    } else {
      postsWithInteractions = posts.map((post) => ({
        ...post,
        userInteraction: {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    }

    const effectivePage = parseInt(page);
    const totalPages = Math.ceil(totalPosts / batchSize);
    const hasNext = skip + batchSize < totalPosts;

    res.status(200).json({
      success: true,
      data: postsWithInteractions,
      pagination: {
        currentPage: effectivePage,
        totalPages,
        totalPosts,
        hasNext,
        hasPrev: effectivePage > 1,
        batchSize: posts.length,
        loadedPosts: skip + posts.length,
      },
      hasNextPage: hasNext,
      nextPage: hasNext ? effectivePage + 1 : null,
      seed: randomSeed.toString(),
      isFirstLoad: isFirstLoad === "true",
    });
  } catch (error) {
    console.error("Get infinite posts seeded error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching posts",
      error: error.message,
    });
  }
};

// ALTERNATIVE: Simpler randomization approach
export const getInfinitePostsSimple = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 5,
      sortBy = "createdAt",
      sortOrder = "desc",
      seed,
      tags,
      location,
      search,
      isFirstLoad = false,
    } = req.query;

    const filter = {};

    if (tags) {
      filter.tags = { $in: tags.split(",") };
    }

    if (location) {
      filter.location = new RegExp(location, "i");
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    const batchSize = isFirstLoad === "true" ? 20 : parseInt(limit);
    const skip = (parseInt(page) - 1) * batchSize;

    let randomSeed;
    if (seed && seed !== "null" && seed !== "undefined") {
      const cleanSeed = seed.toString().replace(/[^0-9]/g, '');
      randomSeed = parseInt(cleanSeed) || Math.floor(Math.random() * 1000000);
    } else {
      randomSeed = Math.floor(Math.random() * 1000000);
    }

    let posts;
    let totalPosts;

    if (sortBy === "random" || !sortBy || sortBy === "createdAt") {
      console.log(`🎲 Using simple randomization with seed: ${randomSeed}`);
      
      // Use $sample for all random requests - simplest approach
      const posts = await Post.aggregate([
        { $match: filter },
        { $sample: { size: Math.min(batchSize * 10, 200) } }, // Get larger sample
        { $skip: skip },
        { $limit: batchSize },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "user",
            pipeline: [
              { $project: { userName: 1, fullName: 1, profilepic: 1 } },
            ],
          },
        },
        { $unwind: "$user" }
      ]);
      
      console.log(`✅ Simple random: Got ${posts.length} posts`);
      totalPosts = await Post.countDocuments(filter);
    } else {
      // Regular sorting
      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      posts = await Post.find(filter)
        .populate("user", "userName fullName profilepic")
        .sort(sort)
        .skip(skip)
        .limit(batchSize);

      totalPosts = await Post.countDocuments(filter);
    }

    // Add user interactions (same as before)
    let postsWithInteractions = [];
    if (req.userId) {
      const postIds = posts.map((post) => post._id);
      const userInteractions = await UserPostInteraction.find({
        user: req.userId,
        post: { $in: postIds },
      });

      const interactionMap = {};
      userInteractions.forEach((interaction) => {
        interactionMap[interaction.post.toString()] = {
          liked: interaction.liked,
          disliked: interaction.disliked,
          saved: interaction.saved,
          viewed: interaction.viewed,
        };
      });

      postsWithInteractions = posts.map((post) => ({
        ...post,
        userInteraction: interactionMap[post._id.toString()] || {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    } else {
      postsWithInteractions = posts.map((post) => ({
        ...post,
        userInteraction: {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    }

    const currentBatchSize = isFirstLoad === "true" ? 20 : parseInt(limit);
    const effectivePage = Math.floor(skip / currentBatchSize) + 1;
    const totalPages = Math.ceil(totalPosts / currentBatchSize);
    const hasNext = skip + batchSize < totalPosts;

    res.status(200).json({
      success: true,
      data: postsWithInteractions,
      pagination: {
        currentPage: effectivePage,
        totalPages,
        totalPosts,
        hasNext,
        hasPrev: effectivePage > 1,
        batchSize,
        loadedPosts: skip + batchSize,
      },
      hasNextPage: hasNext,
      nextPage: hasNext ? effectivePage + 1 : null,
      seed: randomSeed.toString(),
      isFirstLoad: isFirstLoad === "true",
    });
  } catch (error) {
    console.error("Get infinite posts simple error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching posts",
      error: error.message,
    });
  }
};

// Keep existing functions unchanged...
export const generateUserSeed = (userId = null) => {
  return Math.floor(Math.random() * 1000000);
};

export const getPostsByUserId = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const posts = await Post.find({ user: userId })
      .populate("user", "userName fullName profilepic")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalPosts = await Post.countDocuments({ user: userId });
    const totalPages = Math.ceil(totalPosts / parseInt(limit));

    res.status(200).json({
      success: true,
      data: posts,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPosts,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Get posts by user ID error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user posts",
      error: error.message,
    });
  }
};

export const getRecentPosts = async (req, res) => {
  try {
    const { hours = 24, limit = 10 } = req.query;

    const timeLimit = new Date();
    timeLimit.setHours(timeLimit.getHours() - parseInt(hours));

    const posts = await Post.find({
      createdAt: { $gte: timeLimit },
    })
      .populate("user", "userName fullName profilepic")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      message: `Posts from last ${hours} hours`,
      data: posts,
      count: posts.length,
    });
  } catch (error) {
    console.error("Get recent posts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching recent posts",
      error: error.message,
    });
  }
};

export const getTrendingPosts = async (req, res) => {
  try {
    const { limit = 10, timeFrame = 7 } = req.query;

    const timeLimit = new Date();
    timeLimit.setDate(timeLimit.getDate() - parseInt(timeFrame));

    const posts = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: timeLimit },
        },
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: ["$reactions.likes", 3] },
              { $multiply: ["$views", 0.1] },
              {
                $multiply: [
                  { $subtract: ["$reactions.likes", "$reactions.dislikes"] },
                  1,
                ],
              },
            ],
          },
        },
      },
      {
        $sort: { trendingScore: -1 },
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    await Post.populate(posts, {
      path: "user",
      select: "userName fullName profilepic",
    });

    res.status(200).json({
      success: true,
      message: `Trending posts from last ${timeFrame} days`,
      data: posts,
      count: posts.length,
    });
  } catch (error) {
    console.error("Get trending posts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching trending posts",
      error: error.message,
    });
  }
};

export const getUserAnalytics = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    const analytics = await Post.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          totalViews: { $sum: "$views" },
          totalLikes: { $sum: "$reactions.likes" },
          totalComments: { $sum: "$reactions.comments" },
          avgViews: { $avg: "$views" },
          avgLikes: { $avg: "$reactions.likes" },
        },
      },
    ]);

    const monthlyData = await Post.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          posts: { $sum: 1 },
          views: { $sum: "$views" },
          likes: { $sum: "$reactions.likes" },
        },
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1 },
      },
      {
        $limit: 6,
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    const formattedMonthlyData = monthlyData.map((item) => {
      const date = new Date(item._id.year, item._id.month - 1);
      return {
        date: date.toLocaleDateString("en-US", { month: "short" }),
        posts: item.posts,
        views: item.views,
        likes: item.likes,
      };
    });

    const completeMonthlyData = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = date.toLocaleDateString("en-US", { month: "short" });

      const existingData = formattedMonthlyData.find(
        (item) => item.date === monthName
      );
      completeMonthlyData.push(
        existingData || {
          date: monthName,
          posts: 0,
          views: 0,
          likes: 0,
        }
      );
    }

    let monthlyGrowth = 0;
    if (completeMonthlyData.length >= 2) {
      const currentMonth = completeMonthlyData[completeMonthlyData.length - 1];
      const previousMonth = completeMonthlyData[completeMonthlyData.length - 2];

      if (previousMonth.views > 0) {
        monthlyGrowth = Math.round(
          ((currentMonth.views - previousMonth.views) / previousMonth.views) *
            100
        );
      } else if (currentMonth.views > 0) {
        monthlyGrowth = 100;
      }
    }

    const result = analytics[0] || {
      totalPosts: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      avgViews: 0,
      avgLikes: 0,
    };

    res.status(200).json({
      success: true,
      data: {
        totalViews: result.totalViews || 0,
        totalLikes: result.totalLikes || 0,
        totalComments: result.totalComments || 0,
        totalShares: result.totalShares || 0,
        avgViewsPerPost: Math.round(result.avgViews || 0),
        avgLikesPerPost: Math.round(result.avgLikes || 0),
        totalPosts: result.totalPosts || 0,
        monthlyGrowth,
        chartData: completeMonthlyData,
      },
    });
  } catch (error) {
    console.error("Get user analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user analytics",
      error: error.message,
    });
  }
};

export const getUserPostInteractions = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID format",
      });
    }

    if (!req.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const interaction = await UserPostInteraction.findOne({
      user: req.userId,
      post: id,
    });

    res.json({
      success: true,
      data: interaction || {
        liked: false,
        disliked: false,
        saved: false,
        viewed: false,
      },
    });
  } catch (error) {
    console.error("Get user post interactions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user interactions",
      error: error.message,
    });
  }
};

export const getAllPosts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
      tags,
      location,
      search,
    } = req.query;

    const filter = {};

    if (tags) {
      filter.tags = { $in: tags.split(",") };
    }

    if (location) {
      filter.location = new RegExp(location, "i");
    }

    if (search) {
      filter.$or = [
        { title: new RegExp(search, "i") },
        { description: new RegExp(search, "i") },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const posts = await Post.find(filter)
      .populate("user", "userName fullName profilepic")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    let postsWithInteractions = posts;
    if (req.userId) {
      const postIds = posts.map((post) => post._id);
      const userInteractions = await UserPostInteraction.find({
        user: req.userId,
        post: { $in: postIds },
      });

      const interactionMap = {};
      userInteractions.forEach((interaction) => {
        interactionMap[interaction.post.toString()] = {
          liked: interaction.liked,
          disliked: interaction.disliked,
          saved: interaction.saved,
          viewed: interaction.viewed,
        };
      });

      postsWithInteractions = posts.map((post) => ({
        ...post.toObject(),
        userInteraction: interactionMap[post._id.toString()] || {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    } else {
      postsWithInteractions = posts.map((post) => ({
        ...post.toObject(),
        userInteraction: {
          liked: false,
          disliked: false,
          saved: false,
          viewed: false,
        },
      }));
    }

    const totalPosts = await Post.countDocuments(filter);
    const totalPages = Math.ceil(totalPosts / parseInt(limit));

    res.status(200).json({
      success: true,
      data: postsWithInteractions,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPosts,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    });
  } catch (error) {
    console.error("Get all posts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching posts",
      error: error.message,
    });
  }
};

export const getPostById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid post ID format",
      });
    }

    const post = await Post.findById(id).populate(
      "user",
      "userName fullName profilepic"
    );

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    let userInteraction = null;
    if (req.userId) {
      userInteraction = await UserPostInteraction.findOne({
        user: req.userId,
        post: id,
      });
    }

    const postWithInteraction = {
      ...post.toObject(),
      userInteraction: userInteraction
        ? {
            liked: userInteraction.liked,
            disliked: userInteraction.disliked,
            saved: userInteraction.saved,
            viewed: userInteraction.viewed,
          }
        : {
            liked: false,
            disliked: false,
            saved: false,
            viewed: false,
          },
    };

    res.status(200).json({
      success: true,
      data: postWithInteraction,
    });
  } catch (error) {
    console.error("Get post by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching post",
      error: error.message,
    });
  }
};