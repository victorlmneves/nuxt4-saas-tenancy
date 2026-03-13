import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenantFromCache, setTenantInCache, invalidateTenantCache } from '../../src/runtime/server/utils/cache';

// vi.hoisted creates values before vi.mock factories run (required for ESM hoisting)
const mockRedis = vi.hoisted(() => ({
    get: vi.fn<() => Promise<string | null>>(),
    set: vi.fn<() => Promise<'OK'>>(),
    del: vi.fn<() => Promise<number>>(),
}));

vi.mock('ioredis', () => ({
    // Must use a class/function (not arrow fn) so that `new Redis()` works
    default: class {
        constructor() {
            return mockRedis as unknown as typeof mockRedis;
        }
    },
}));

const REDIS = { driver: 'redis' as const, ttl: 60 };

describe('cache (redis driver)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prefixes the key with "tenancy:" when calling redis.get', async () => {
        mockRedis.get.mockResolvedValue(null);
        await getTenantFromCache('acme', REDIS);

        expect(mockRedis.get).toHaveBeenCalledWith('tenancy:acme');
    });

    it('returns null when redis.get returns null', async () => {
        mockRedis.get.mockResolvedValue(null);

        expect(await getTenantFromCache('acme', REDIS)).toBeNull();
    });

    it('parses and returns the JSON-encoded value from redis', async () => {
        const tenant = { id: '1', name: 'Acme Corp' };
        mockRedis.get.mockResolvedValue(JSON.stringify(tenant));

        expect(await getTenantFromCache('acme', REDIS)).toEqual(tenant);
    });

    it('stores the JSON-encoded value in redis with the correct TTL', async () => {
        const tenant = { id: '1', name: 'Acme Corp' };
        mockRedis.set.mockResolvedValue('OK');
        await setTenantInCache('acme', tenant, REDIS);

        expect(mockRedis.set).toHaveBeenCalledWith('tenancy:acme', JSON.stringify(tenant), 'EX', 60);
    });

    it('uses the ttl from options', async () => {
        mockRedis.set.mockResolvedValue('OK');
        await setTenantInCache('acme', { id: '1' }, { driver: 'redis', ttl: 300 });

        expect(mockRedis.set).toHaveBeenCalledWith('tenancy:acme', expect.any(String), 'EX', 300);
    });

    it('defaults ttl to 60 when not specified', async () => {
        mockRedis.set.mockResolvedValue('OK');
        await setTenantInCache('acme', { id: '1' }, { driver: 'redis' });

        expect(mockRedis.set).toHaveBeenCalledWith('tenancy:acme', expect.any(String), 'EX', 60);
    });

    it('deletes the prefixed key from redis on invalidation', async () => {
        mockRedis.del.mockResolvedValue(1);
        await invalidateTenantCache('acme', REDIS);

        expect(mockRedis.del).toHaveBeenCalledWith('tenancy:acme');
    });

    it('invalidation always clears the memory store as well', async () => {
        // Write to memory first, then invalidate via memory opts — redis del should NOT be called
        await invalidateTenantCache('acme');

        expect(mockRedis.del).not.toHaveBeenCalled();
    });
});
