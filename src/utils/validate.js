const validator = require("validator");
const AppError = require("./AppError");

const validateSignup = (data) => {
    const { firstName, lastName, email, password } = data;

    // First Name
    if (!firstName || !firstName.trim()) {
        throw new AppError("First name is required", 400);
    }

    if (!validator.isLength(firstName.trim(), { min: 2, max: 50 })) {
        throw new AppError("First name must be between 2 and 50 characters", 400);
    }

    if (!validator.isAlpha(firstName.replace(/\s/g, ""))) {
        throw new AppError("First name must contain only letters", 400);
    }

    // Last Name
    if (!lastName || !lastName.trim()) {
        throw new AppError("Last name is required", 400);
    }

    if (!validator.isLength(lastName.trim(), { min: 1, max: 50 })) {
        throw new AppError("Last name must be between 1 and 50 characters", 400);
    }

    if (!validator.isAlpha(lastName.replace(/\s/g, ""))) {
        throw new AppError("Last name must contain only letters", 400);
    }

    // Email
    if (!email || !validator.isEmail(email)) {
        throw new AppError("Invalid email address", 400);
    }

    // Password
    if (
        !password ||
        !validator.isStrongPassword(password, {
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 0,
        })
    ) {
        throw new AppError(
            "Password must be at least 8 characters and include upper, lower and number"
        , 400);
    }
};


const validateProfileEditData = (data) => {
    const allowedFields = [
        "firstName",
        "lastName",
        "age",
        "gender",
        "photoUrl",
        "coverPhotoUrl",
        "about",
        "skills"
    ];

    // Allow only permitted fields
    const isAllowed = Object.keys(data).every((key) =>
        allowedFields.includes(key)
    );

    if (!isAllowed) {
        throw new AppError("Invalid fields in update request", 400);
    }

    const { firstName, lastName, age, gender, photoUrl, coverPhotoUrl, about, skills } = data;

    // First Name
    if (firstName !== undefined) {
        if (!firstName.trim()) {
            throw new AppError("First name cannot be empty", 400);
        }

        if (firstName.trim().length > 50) {
            throw new AppError("First name cannot exceed 50 characters", 400);
        }

        if (!validator.isAlpha(firstName.replace(/\s/g, ""))) {
            throw new AppError("First name must contain only letters", 400);
        }
    }

    // Last Name
    if (lastName !== undefined) {
        if (!lastName.trim()) {
            throw new AppError("Last name cannot be empty", 400);
        }

        if (lastName.trim().length > 50) {
            throw new AppError("Last name cannot exceed 50 characters", 400);
        }

        if (!validator.isAlpha(lastName.replace(/\s/g, ""))) {
            throw new AppError("Last name must contain only letters", 400);
        }
    }

    // Age
    if (age !== undefined) {
        if (!Number.isInteger(age) || age < 18 || age > 100) {
            throw new AppError("Age must be between 18 and 100", 400);
        }
    }

    // Gender
    if (gender !== undefined) {
        const allowedGender = ["male", "female", "other"];

        if (!allowedGender.includes(gender.toLowerCase())) {
            throw new AppError("Gender must be male, female or other", 400);
        }
    }

    // Photo URL
    if (photoUrl !== undefined) {
        if (!validator.isURL(photoUrl)) {
            throw new AppError("Invalid photo URL", 400);
        }
    }

    // Cover Photo URL
    if (coverPhotoUrl !== undefined) {
        if (!validator.isURL(coverPhotoUrl)) {
            throw new AppError("Invalid cover photo URL", 400);
        }
    }

    // About
    if (about !== undefined) {
        if (!about.trim()) {
            throw new AppError("About section cannot be empty", 400);
        }

        if (about.length > 500) {
            throw new AppError("About cannot exceed 500 characters", 400);
        }
    }

    // Skills
    if (skills !== undefined) {
        if (!Array.isArray(skills)) {
            throw new AppError("Skills must be an array", 400);
        }

        if (skills.length > 20) {
            throw new AppError("You can add maximum 20 skills", 400);
        }

        skills.forEach((skill) => {
            if (typeof skill !== "string" || !skill.trim()) {
                throw new AppError("Each skill must be a non-empty string", 400);
            }

            if (skill.length > 30) {
                throw new AppError("Each skill must be under 30 characters", 400);
            }
        });
    }
};


module.exports = { validateSignup, validateProfileEditData };