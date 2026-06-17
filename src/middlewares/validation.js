const { param, validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

const validateObjectId = (paramName) => {
    return [
        param(paramName)
            .isMongoId()
            .withMessage(`Invalid ${paramName} format`),
        (req, res, next) => {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return next(new AppError(errors.array()[0].msg, 400));
            }
            next();
        }
    ];
};

module.exports = {
    validateObjectId
};
