import Post from "../models/post.model.js";
import UserPostInteraction from "../models/UserPostInteraction.model.js";
import mongoose from "mongoose";

export const toggleLike = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.userId; // From auth middleware

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        // Check if post exists
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found"
            });
        }

        // Start a database transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find or create user interaction
            let interaction = await UserPostInteraction.findOne({
                user: userId,
                post: postId
            }).session(session);

            let wasLiked = false;
            let wasDisliked = false;
            let newLikeState = false;

            if (!interaction) {
                // Create new interaction - user likes the post
                interaction = new UserPostInteraction({
                    user: userId,
                    post: postId,
                    liked: true,
                    disliked: false
                });
                newLikeState = true;
                
                // Increment likes count
                await Post.findByIdAndUpdate(
                    postId,
                    { $inc: { "reactions.likes": 1 } },
                    { session }
                );

            } else {
                wasLiked = interaction.liked;
                wasDisliked = interaction.disliked;

                if (wasLiked) {
                    // User is removing their like
                    interaction.liked = false;
                    newLikeState = false;
                    
                    // Decrement likes count
                    await Post.findByIdAndUpdate(
                        postId,
                        { $inc: { "reactions.likes": -1 } },
                        { session }
                    );

                } else {
                    // User is adding a like
                    interaction.liked = true;
                    newLikeState = true;
                    
                    // If user previously disliked, remove dislike
                    if (wasDisliked) {
                        interaction.disliked = false;
                        // Decrement dislikes, increment likes
                        await Post.findByIdAndUpdate(
                            postId,
                            { 
                                $inc: { 
                                    "reactions.likes": 1,
                                    "reactions.dislikes": -1 
                                } 
                            },
                            { session }
                        );
                    } else {
                        // Just increment likes
                        await Post.findByIdAndUpdate(
                            postId,
                            { $inc: { "reactions.likes": 1 } },
                            { session }
                        );
                    }
                }
            }

            await interaction.save({ session });
            await session.commitTransaction();

            // Get updated post data
            const updatedPost = await Post.findById(postId)
                .populate('user', 'userName fullName profilePic'); // Updated to match your user schema

            res.status(200).json({
                success: true,
                message: newLikeState ? "Post liked successfully" : "Like removed successfully",
                data: {
                    liked: newLikeState,
                    disliked: interaction.disliked,
                    post: {
                        _id: updatedPost._id,
                        likes: updatedPost.reactions.likes,
                        dislikes: updatedPost.reactions.dislikes
                    },
                    previousState: {
                        wasLiked,
                        wasDisliked
                    }
                }
            });

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error("Toggle like error:", error);
        res.status(500).json({
            success: false,
            message: "Error processing like action",
            error: error.message
        });
    }
};

export const toggleDislike = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        // Check if post exists
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found"
            });
        }

        // Start a database transaction
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Find or create user interaction
            let interaction = await UserPostInteraction.findOne({
                user: userId,
                post: postId
            }).session(session);

            let wasLiked = false;
            let wasDisliked = false;
            let newDislikeState = false;

            if (!interaction) {
                // Create new interaction - user dislikes the post
                interaction = new UserPostInteraction({
                    user: userId,
                    post: postId,
                    liked: false,
                    disliked: true
                });
                newDislikeState = true;
                
                // Increment dislikes count
                await Post.findByIdAndUpdate(
                    postId,
                    { $inc: { "reactions.dislikes": 1 } },
                    { session }
                );

            } else {
                wasLiked = interaction.liked;
                wasDisliked = interaction.disliked;

                if (wasDisliked) {
                    // User is removing their dislike
                    interaction.disliked = false;
                    newDislikeState = false;
                    
                    // Decrement dislikes count
                    await Post.findByIdAndUpdate(
                        postId,
                        { $inc: { "reactions.dislikes": -1 } },
                        { session }
                    );

                } else {
                    // User is adding a dislike
                    interaction.disliked = true;
                    newDislikeState = true;
                    
                    // If user previously liked, remove like
                    if (wasLiked) {
                        interaction.liked = false;
                        // Decrement likes, increment dislikes
                        await Post.findByIdAndUpdate(
                            postId,
                            { 
                                $inc: { 
                                    "reactions.dislikes": 1,
                                    "reactions.likes": -1 
                                } 
                            },
                            { session }
                        );
                    } else {
                        // Just increment dislikes
                        await Post.findByIdAndUpdate(
                            postId,
                            { $inc: { "reactions.dislikes": 1 } },
                            { session }
                        );
                    }
                }
            }

            await interaction.save({ session });
            await session.commitTransaction();

            // Get updated post data
            const updatedPost = await Post.findById(postId)
                .populate('user', 'userName fullName profilePic'); // Updated to match your user schema

            res.status(200).json({
                success: true,
                message: newDislikeState ? "Post disliked successfully" : "Dislike removed successfully",
                data: {
                    liked: interaction.liked,
                    disliked: newDislikeState,
                    post: {
                        _id: updatedPost._id,
                        likes: updatedPost.reactions.likes,
                        dislikes: updatedPost.reactions.dislikes
                    },
                    previousState: {
                        wasLiked,
                        wasDisliked
                    }
                }
            });

        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }

    } catch (error) {
        console.error("Toggle dislike error:", error);
        res.status(500).json({
            success: false,
            message: "Error processing dislike action",
            error: error.message
        });
    }
};

// Get user's interaction status with a post
export const getUserPostInteraction = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.userId;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid post ID format"
            });
        }

        const interaction = await UserPostInteraction.findOne({
            user: userId,
            post: postId
        });

        res.status(200).json({
            success: true,
            data: interaction ? {
                liked: interaction.liked,
                disliked: interaction.disliked,
                saved: interaction.saved,
                viewed: interaction.viewed,
                lastInteraction: interaction.lastInteraction
            } : {
                liked: false,
                disliked: false,
                saved: false,
                viewed: false,
                lastInteraction: null
            }
        });

    } catch (error) {
        console.error("Get user post interaction error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching user interaction",
            error: error.message
        });
    }
};