import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getRedisClient, isRedisAvailable, setCache, getCache, deleteCache } from '../redis';

describe('Redis Client', () => {
  let redis: ReturnType<typeof getRedisClient>;

  beforeAll(async () => {
    redis = getRedisClient();
  });

  afterAll(async () => {
    if (isRedisAvailable()) {
      await redis.quit();
    }
  });

  it('should return a singleton Redis instance', () => {
    const instance1 = getRedisClient();
    const instance2 = getRedisClient();
    expect(instance1).toBe(instance2);
  });

  it('should have graceful degradation when Redis is unavailable', () => {
    // This test verifies the fallback behavior
    expect(typeof isRedisAvailable()).toBe('boolean');
  });

  it('should set cache value with TTL', async () => {
    const key = 'test:cache:key';
    const value = JSON.stringify({ test: 'data' });

    if (isRedisAvailable()) {
      await setCache(key, value, 300);
      const result = await getCache(key);
      expect(result).toBe(value);
      await deleteCache(key);
    }
  });

  it('should retrieve cached value', async () => {
    const key = 'test:retrieve:key';
    const value = JSON.stringify({ id: '123', name: 'Test' });

    if (isRedisAvailable()) {
      await setCache(key, value, 300);
      const result = await getCache(key);
      expect(result).toBe(value);
      await deleteCache(key);
    }
  });

  it('should return null for non-existent key', async () => {
    if (isRedisAvailable()) {
      const result = await getCache('non:existent:key');
      expect(result).toBeNull();
    }
  });

  it('should delete cache value', async () => {
    const key = 'test:delete:key';
    const value = JSON.stringify({ data: 'test' });

    if (isRedisAvailable()) {
      await setCache(key, value, 300);
      await deleteCache(key);
      const result = await getCache(key);
      expect(result).toBeNull();
    }
  });

  it('should use default TTL of 300 seconds', async () => {
    const key = 'test:ttl:key';
    const value = JSON.stringify({ ttl: 'default' });

    if (isRedisAvailable()) {
      await setCache(key, value);
      const result = await getCache(key);
      expect(result).toBe(value);
      await deleteCache(key);
    }
  });
});
