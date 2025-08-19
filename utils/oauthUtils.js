import User from '../models/user.model.js';
import Board from '../models/board.model.js';

export const generateUniqueUsername = async (displayName) => {
    try {
        let baseUsername = displayName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 15) || 'user';
        
        let username = baseUsername;
        let counter = 1;
        
        while (await User.findOne({ userName: username })) {
            username = `${baseUsername}${counter}`;
            counter++;
            if (counter > 1000) {
                username = `user${Date.now()}`;
                break;
            }
        }
        
        return username;
    } catch (error) {
        console.error('Username generation error:', error);
        return `user${Date.now()}`;
    }
};

export const createUserBoard = async (userId) => {
    try {
        const existingBoard = await Board.findOne({ user: userId });
        if (existingBoard) {
            console.log('Board already exists for user:', userId);
            return existingBoard;
        }

        const newBoard = new Board({
            user: userId,
            bio: '',
            location: '',
            website: '',
            socialStats: {
                followers: 0,
                following: 0,
                posts: 0
            },
            interests: []
        });
        
        const savedBoard = await newBoard.save();
        console.log('Board created for user:', userId);
        return savedBoard;
    } catch (error) {
        console.error('Board creation error:', error);
    }
};

export const handleOAuthUser = async (profile, provider) => {
    const email = profile.emails?.[0]?.value || profile.email || '';
    const displayName = profile.displayName || 
        `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() ||
        `${provider} User`;
    const providerIdField = `${provider.toLowerCase()}Id`;
    
    // Check if user exists
    let existingUser = await User.findOne({ 
        $or: [
            { email: email },
            { [providerIdField]: profile.id }
        ]
    });

    if (existingUser) {
        console.log(`${provider} OAuth - Existing user found`);
        if (!existingUser[providerIdField]) {
            existingUser[providerIdField] = profile.id;
            await existingUser.save();
        }
        return existingUser;
    }

    console.log(`${provider} OAuth - Creating new user`);
    const userData = {
        fullName: displayName,
        userName: await generateUniqueUsername(displayName.replace(/\s+/g, '') || `${provider.toLowerCase()}user`),
        email: email,
        hashedPassword: 'oauth_user',
        profilepic: profile.photos?.[0]?.value || profile.picture || '',
        [providerIdField]: profile.id,
    };

    const newUser = new User(userData);
    const savedUser = await newUser.save();
    await createUserBoard(savedUser._id);

    console.log(`${provider} OAuth - New user created:`, savedUser._id);
    return savedUser;
};
