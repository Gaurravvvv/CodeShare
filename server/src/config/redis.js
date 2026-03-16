import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export function createRedisClient(options = {}) {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
    ...options,
  });

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('connect', () => {
    console.log('[Redis] Connected to', REDIS_URL.replace(/\/\/.*@/, '//***@'));
  });

  return client;
}

// Primary client for read/write
export const redis = createRedisClient();

// Subscriber client for keyspace notifications (needs separate connection)
export const redisSub = createRedisClient();
