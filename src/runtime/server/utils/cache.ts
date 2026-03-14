/**
 * Simple in-memory + Redis + Nitro-storage cache for resolved tenants.
 * Uses a Map for 'memory' driver, ioredis for 'redis', or Nitro's built-in
 * useStorage() for 'nitro' (works on Cloudflare Workers, Vercel KV, etc.).
 */

export interface CacheOptions {
    driver: 'memory' | 'redis' | 'nitro';
    ttl?: number;
    redisUrl?: string;
    /**
     * Maximum number of entries in the in-memory store. Oldest entry is evicted when full.
     * @default 500
     */
    maxMemoryEntries?: number;
}

// In-memory store: key → { value, expiresAt }
const memoryStore = new Map<string, { value: unknown; expiresAt: number }>();

/** Default memory entry ceiling. Prevents unbounded growth under high-cardinality tenants. */
const DEFAULT_MAX_MEMORY_ENTRIES = 500;

const NITRO_STORAGE_BASE = 'tenancy';

// Module-level cache config — set once at Nitro startup by the tenancy plugin.
// Allows callers to call invalidateTenantCache(key) without re-passing opts.
let _defaultCacheOpts: CacheOptions | undefined;

export function setCacheConfig(opts: CacheOptions): void {
    _defaultCacheOpts = opts;
}

export async function getTenantFromCache<T = unknown>(key: string, opts: CacheOptions): Promise<T | null> {
    if (opts.driver === 'memory') {
        const entry = memoryStore.get(key);

        if (!entry) {
            return null;
        }

        if (Date.now() > entry.expiresAt) {
            memoryStore.delete(key);

            return null;
        }

        return entry.value as T;
    }

    if (opts.driver === 'redis') {
        const redis = await getRedisClient(opts.redisUrl);
        const raw = await redis.get(`tenancy:${key}`);

        return raw ? (JSON.parse(raw) as T) : null;
    }

    if (opts.driver === 'nitro') {
        const { useStorage } = await import('nitropack/runtime');
        const storage = useStorage(NITRO_STORAGE_BASE);
        const value = await storage.getItem<T>(key);

        return value ?? null;
    }

    return null;
}

export async function setTenantInCache<T = unknown>(key: string, value: T, opts: CacheOptions): Promise<void> {
    const ttl = opts.ttl ?? 60;

    if (opts.driver === 'memory') {
        const ttlMs = ttl * 1000;
        const maxEntries = opts.maxMemoryEntries ?? DEFAULT_MAX_MEMORY_ENTRIES;

        // Evict expired entries first, then oldest-inserted entry if still over limit
        if (memoryStore.size >= maxEntries) {
            const now = Date.now();

            for (const [k, entry] of memoryStore) {
                if (entry.expiresAt <= now) {
                    memoryStore.delete(k);
                }

                if (memoryStore.size < maxEntries) break;
            }

            // If still at/over limit after purging expired, evict the oldest entry
            if (memoryStore.size >= maxEntries) {
                const oldest = memoryStore.keys().next().value;

                if (oldest !== undefined) memoryStore.delete(oldest);
            }
        }

        memoryStore.set(key, { value, expiresAt: Date.now() + ttlMs });

        return;
    }

    if (opts.driver === 'redis') {
        const redis = await getRedisClient(opts.redisUrl);
        await redis.set(`tenancy:${key}`, JSON.stringify(value), 'EX', ttl);

        return;
    }

    if (opts.driver === 'nitro') {
        const { useStorage } = await import('nitropack/runtime');
        const storage = useStorage(NITRO_STORAGE_BASE);

        // Nitro storage TTL is expressed in seconds via setItem options
        // T may be any object; unstorage's StorageValue requires a castable type
        await storage.setItem(key, value as unknown as Record<string, unknown>, { ttl });
    }
}

export async function invalidateTenantCache(key: string, opts?: CacheOptions): Promise<void> {
    // Resolve opts: explicit argument takes priority, then the runtime-configured default
    const resolvedOpts = opts ?? _defaultCacheOpts;

    // Always clear memory store
    memoryStore.delete(key);

    if (resolvedOpts?.driver === 'redis') {
        const redis = await getRedisClient(resolvedOpts.redisUrl);
        await redis.del(`tenancy:${key}`);

        return;
    }

    if (resolvedOpts?.driver === 'nitro') {
        const { useStorage } = await import('nitropack/runtime');
        const storage = useStorage(NITRO_STORAGE_BASE);

        await storage.removeItem(key);
    }
}

/**
 * Flush the entire tenant cache across all active drivers.
 * Useful after bulk migrations or in test teardown.
 * @param {CacheOptions} [opts] - Override the cache options (defaults to the runtime-configured driver).
 * @returns {Promise<void>}
 */
export async function invalidateTenantCacheAll(opts?: CacheOptions): Promise<void> {
    const resolvedOpts = opts ?? _defaultCacheOpts;

    // Always clear the full in-memory store
    memoryStore.clear();

    if (resolvedOpts?.driver === 'redis') {
        const redis = await getRedisClient(resolvedOpts.redisUrl);
        // Scan + delete only keys under the 'tenancy:' prefix to avoid wiping unrelated data
        let cursor = '0';

        do {
            const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'tenancy:*', 'COUNT', 100);
            cursor = nextCursor;

            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } while (cursor !== '0');

        return;
    }

    if (resolvedOpts?.driver === 'nitro') {
        const { useStorage } = await import('nitropack/runtime');
        const storage = useStorage(NITRO_STORAGE_BASE);

        await storage.clear();
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
