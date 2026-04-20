const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const connectDb = require("../database/connection");
const User = require("../models/user");

const FIRST_NAMES = [
    "Aarav", "Vivaan", "Ishaan", "Vihaan", "Advik", "Arjun", "Kabir", "Reyansh",
    "Aanya", "Diya", "Myra", "Kiara", "Anaya", "Sara", "Riya", "Meera"
];

const LAST_NAMES = [
    "Sharma", "Verma", "Gupta", "Reddy", "Nair", "Patel", "Singh", "Khan",
    "Das", "Iyer", "Mehta", "Joshi", "Malik", "Chopra", "Bose", "Kapoor"
];

const SKILL_POOL = [
    "JavaScript", "TypeScript", "Node.js", "Express", "MongoDB", "Redis", "Docker", "AWS",
    "React", "Next.js", "GraphQL", "REST API", "Python", "PostgreSQL", "CI/CD", "Git"
];

const ABOUT_LINES = [
    "Building backend systems and automating workflows.",
    "Focused on scalable APIs and clean architecture.",
    "Love shipping reliable code with strong testing.",
    "Enjoy solving distributed systems problems.",
    "Full-stack developer with a backend-first mindset.",
    "Open source contributor and hackathon enthusiast.",
    "Always learning cloud-native development patterns.",
    "Passionate about developer tooling and DX improvements."
];

const DEVICES = ["Windows Laptop", "MacBook Pro", "Linux Workstation", "Android Phone", "iPhone"];

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem(items) {
    return items[randomInt(0, items.length - 1)];
}

function randomSubset(items, minCount, maxCount) {
    const copy = [...items].sort(() => Math.random() - 0.5);
    const size = randomInt(minCount, maxCount);
    return copy.slice(0, size);
}

function randomIpAddress() {
    return `${randomInt(10, 240)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 254)}`;
}

function randomDateWithinDays(daysBack) {
    const now = Date.now();
    const backMs = randomInt(0, daysBack) * 24 * 60 * 60 * 1000;
    return new Date(now - backMs);
}

function buildBotUser(index, passwordHash) {
    const firstName = randomItem(FIRST_NAMES);
    const lastName = randomItem(LAST_NAMES);
    const lowerName = `${firstName}.${lastName}`.toLowerCase();
    const uniqueSuffix = `${Date.now()}${index}`;

    const currentStreak = randomInt(0, 30);
    const longestStreak = randomInt(currentStreak, currentStreak + 50);

    return {
        firstName,
        lastName,
        about: randomItem(ABOUT_LINES),
        email: `${lowerName}.bot${uniqueSuffix}@devsync.local`,
        skills: randomSubset(SKILL_POOL, 4, 8),
        password: passwordHash,
        photoUrl: `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(uniqueSuffix)}`,
        coverPhotoUrl: `https://picsum.photos/seed/cover-${uniqueSuffix}/1200/400`,
        age: randomInt(18, 45),
        gender: randomItem(["male", "female", "other"]),
        isVerified: true,
        authProvider: "local",
        currentStreak,
        longestStreak,
        lastActivityAt: randomDateWithinDays(30),
        devices: [
            {
                device: randomItem(DEVICES),
                ip: randomIpAddress(),
                lastLogin: randomDateWithinDays(7),
            },
        ],
    };
}

async function clearAllCollections() {
    const collections = await mongoose.connection.db.collections();

    for (const collection of collections) {
        await collection.deleteMany({});
    }

    return collections.map((c) => c.collectionName);
}

async function seedBotUsers(count) {
    const passwordHash = await bcrypt.hash("Bot@12345", 10);
    const botUsers = [];

    for (let i = 1; i <= count; i += 1) {
        botUsers.push(buildBotUser(i, passwordHash));
    }

    await User.insertMany(botUsers);
}

async function run() {
    const requestedCount = Number.parseInt(process.argv[2], 10);
    const seedCount = Number.isNaN(requestedCount) ? randomInt(50, 100) : Math.max(50, Math.min(100, requestedCount));

    await connectDb();
    console.log("Connected to database");

    const clearedCollections = await clearAllCollections();
    console.log(`Cleared collections: ${clearedCollections.join(", ")}`);

    await seedBotUsers(seedCount);
    console.log(`Seeded ${seedCount} bot users successfully`);
    console.log("Bot default password: Bot@12345");
}

run()
    .catch((error) => {
        console.error("Reset and seed failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.connection.close();
        console.log("Database connection closed");
    });