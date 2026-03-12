/**
 * Simple in-memory + Redis-compatible cache for resolved tenants.
 * Uses a Map for 'memory' driver, or ioredis for 'redis'.
 */

interface CacheOptions {
    driver: 'memory' | 'redis' | 'nitro';
    ttl?: number;
    redisUrl?: string;
}

// In-memory store: key → { value, expiresAt }
const memoryStore = new Map<string, { value: unknown; expiresAt: number }>();

export async function getTenantFromCache(key: string, opts: CacheOptions): Promise<unknown | null> {
    if (opts.driver === 'memory') {
        const entry = memoryStore.get(key);

        if (!entry) {
            return null;
        }

        if (Date.now() > entry.expiresAt) {
            memoryStore.delete(key);

            return null;
        }

        return entry.value;
    }

    if (opts.driver === 'redis') {
        const redis = await getRedisClient(opts.redisUrl);
        const raw = await redis.get(`tenancy:${key}`);

        return raw ? JSON.parse(raw) : null;
    }

    return null;
}

export async function setTenantInCache(key: string, value: unknown, opts: CacheOptions): Promise<void> {
    const ttl = opts.ttl ?? 60;

    if (opts.driver === 'memory') {
        memoryStore.set(key, { value, expiresAt: Date.now() + ttl * 1000 });

        return;
    }

    if (opts.driver === 'redis') {
        const redis = await getRedisClient(opts.redisUrl);
        await redis.set(`tenancy:${key}`, JSON.stringify(value), 'EX', ttl);
    }
}

export async function invalidateTenantCache(key: string, opts?: CacheOptions): Promise<void> {
    // Always clear memory store
    memoryStore.delete(key);

    if (opts?.driver === 'redis') {
        const redis = await getRedisClient(opts.redisUrl);
        await redis.del(`tenancy:${key}`);
    }
}

// Lazy Redis client singleton
let _redisClient: import('ioredis').Redis | null = null;

async function getRedisClient(url?: string): Promise<import('ioredis').Redis> {
    if (_redisClient) {
        return _redisClient;
    }

    const { default: Redis } = await import('ioredis');
    _redisClient = new Redis(url ?? process.env.REDIS_URL ?? 'redis://localhost:6379');

    return _redisClient;
}
