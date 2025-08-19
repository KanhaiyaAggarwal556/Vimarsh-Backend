export const validatePasswordStrength = (password) => {
    if (password.length < 8) {
        return { valid: false, message: "Password must be at least 8 characters long" };
    }
    if (!/(?=.*[a-z])/.test(password)) {
        return { valid: false, message: "Password must contain at least one lowercase letter" };
    }
    if (!/(?=.*[A-Z])/.test(password)) {
        return { valid: false, message: "Password must contain at least one uppercase letter" };
    }
    if (!/(?=.*\d)/.test(password)) {
        return { valid: false, message: "Password must contain at least one number" };
    }
    return { valid: true };
};

export const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

export const validateRequiredFields = (fields, data) => {
    const missing = fields.filter(field => !data[field] || data[field].trim() === '');
    if (missing.length > 0) {
        return {
            valid: false,
            message: `Missing required fields: ${missing.join(', ')}`
        };
    }
    return { valid: true };
};