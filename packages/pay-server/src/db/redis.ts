import Redis, { RedisOptions } from 'ioredis';

let redisInstance: Redis | null = null;
let redisAvailable = false;

function createRedisClient(): Redis {
  // REDIS_URL 우선, 없으면 REDIS_HOST/REDIS_PORT 개별 사용
  const redisUrl = process.env.REDIS_URL;

  const options: RedisOptions = {
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  };

  let client: Redis;
  if (redisUrl) {
    client = new Redis(redisUrl, options);
  } else {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);
    client = new Redis({ ...options, host, port });
  }

  client.on('error', (err) => {
    console.warn('Redis connection error:', err.message || err);
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
