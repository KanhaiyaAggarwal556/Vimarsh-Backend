export const sendErrorResponse = (res, statusCode, message, error = null) => {
    return res.status(statusCode).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? error : undefined
    });
};

export const sendSuccessResponse = (res, statusCode, message, data = null) => {
    const response = {
        success: true,
        message
    };
    
    if (data) {
        response.data = data;
    }
    
    return res.status(statusCode).json(response);
};

export const sanitizeUser = (user) => {
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.hashedPassword;
    return userObj;
};
