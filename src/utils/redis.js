const { createClient } = require('redis');
const logger = require('./logger');

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));

let isRedisConnected = false;

const connectRedis = async () => {
    if (!isRedisConnected) {
        try {
            await redisClient.connect();
            isRedisConnected = true;
            logger.info('Connected to Redis successfully');
        } catch (error) {
            logger.error('Failed to connect to Redis', error);
        }
    }
};

connectRedis();

module.exports = redisClient;
