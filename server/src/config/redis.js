import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

// If REDIS_URL is provided (e.g., Upstash), use it directly. 
// Otherwise, fallback to the default local configuration.
export const redisClient = redisUrl ? new Redis(redisUrl) : new Redis({
  host: '127.0.0.1',
  port: 6379,
});
export const redis = redisClient; // Added to fix backward compatibility back in roomService.js

export const redisSub = redisUrl ? new Redis(redisUrl) : new Redis({
  host: '127.0.0.1',
  port: 6379,
});

// Error Handlers
redisClient.on('error', (err) => console.error('[Redis] Main Client Error:', err));
redisSub.on('error', (err) => console.error('[Redis] Subscriber Error:', err));

redisClient.on('connect', () => console.log('[Redis] Main Client Connected ✓'));
redisSub.on('connect', () => console.log('[Redis] Expiry Subscriber Connected ✓'));