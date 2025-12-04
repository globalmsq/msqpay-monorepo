import Redis from 'ioredis';

let redisInstance: Redis | null = null;
let redisAvailable = false;

function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = new Redis(redisUrl, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

  client.on('error', (err) => {
    console.warn('Redis connection error:', err.message);
    redisAvailable = false;
  });

  client.on('connect', () => {
    redisAvailable = true;
  });

  client.on('close', () => {
    redisAvailable = false;
  });

  return client;
}

export function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = createRedisClient();
  }
  return redisInstance;
}

export function isRedisAvailable(): boolean {
  return redisAvailable && redisInstance?.status === 'ready';
}

export async function setCache(key: string, value: string, ttl: number = 300): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    const client = getRedisClient();
    await client.setex(key, ttl, value);
  } catch (error) {
    console.warn(`Failed to set cache for key ${key}:`, error);
  }
}

export async function getCache(key: string): Promise<string | null> {
  if (!isRedisAvailable()) {
    return null;
  }

  try {
    const client = getRedisClient();
    return await client.get(key);
  } catch (error) {
    console.warn(`Failed to get cache for key ${key}:`, error);
    return null;
  }
}

export async function deleteCache(key: string): Promise<void> {
  if (!isRedisAvailable()) {
    return;
  }

  try {
    const client = getRedisClient();
    await client.del(key);
  } catch (error) {
    console.warn(`Failed to delete cache for key ${key}:`, error);
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    redisAvailable = false;
  }
}
