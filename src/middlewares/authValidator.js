const { body, validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return next(new AppError(errors.array()[0].msg, 400));
    }
    next();
};

const signupValidator = [
    body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters').isAlpha().withMessage('First name must contain only letters'),
    body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ min: 1, max: 50 }).withMessage('Last name must be between 1 and 50 characters').isAlpha().withMessage('Last name must contain only letters'),
    body('email').isEmail().withMessage('Invalid email address').normalizeEmail(),
    body('password').isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 0,
    }).withMessage('Password must be strong: at least 8 characters, including lowercase, uppercase, and a number'),
    handleValidationErrors
];

const loginValidator = [
    body('email').isEmail().withMessage('Invalid email address').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors
];

module.exports = {
    signupValidator,
    loginValidator
};
