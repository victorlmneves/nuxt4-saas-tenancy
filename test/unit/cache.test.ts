import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getTenantFromCache,
    setTenantInCache,
    invalidateTenantCache,
    invalidateTenantCacheAll,
} from '../../src/runtime/server/utils/cache';

// Access the private in-memory store via the module (reset between tests via
// invalidate, which is the public API)
const MEM = { driver: 'memory' as const, ttl: 60 };

describe('cache (memory driver)', () => {
    beforeEach(async () => {
        // Clear any leftover entries from previous tests
        await invalidateTenantCache('acme');
        await invalidateTenantCache('globex');
    });

    it('returns null for a key that has not been set', async () => {
        expect(await getTenantFromCache('acme', MEM)).toBeNull();
    });

    it('stores and retrieves a tenant object', async () => {
        const tenant = { id: '1', name: 'Acme' };
        await setTenantInCache('acme', tenant, MEM);

        expect(await getTenantFromCache('acme', MEM)).toEqual(tenant);
    });

    it('returns null after the entry has been invalidated', async () => {
        await setTenantInCache('acme', { id: '1' }, MEM);
        await invalidateTenantCache('acme');

        expect(await getTenantFromCache('acme', MEM)).toBeNull();
    });

    it('returns null after the TTL has expired', async () => {
        vi.useFakeTimers();
        await setTenantInCache('acme', { id: '1' }, { driver: 'memory', ttl: 1 });

        // Advance time past the 1-second TTL
        vi.advanceTimersByTime(1500);

        expect(await getTenantFromCache('acme', MEM)).toBeNull();
        vi.useRealTimers();
    });

    it('does not mix entries across different keys', async () => {
        await setTenantInCache('acme', { id: '1', name: 'Acme' }, MEM);
        await setTenantInCache('globex', { id: '2', name: 'Globex' }, MEM);

        expect(await getTenantFromCache('acme', MEM)).toEqual({ id: '1', name: 'Acme' });
        expect(await getTenantFromCache('globex', MEM)).toEqual({ id: '2', name: 'Globex' });
    });

    it('overwrites an existing entry on re-set', async () => {
        await setTenantInCache('acme', { id: '1', name: 'Old' }, MEM);
        await setTenantInCache('acme', { id: '1', name: 'New' }, MEM);

        expect(await getTenantFromCache('acme', MEM)).toEqual({ id: '1', name: 'New' });
    });

    it('evicts the oldest entry when maxMemoryEntries is reached', async () => {
        const opts = { driver: 'memory' as const, ttl: 60, maxMemoryEntries: 3 };

        await setTenantInCache('t1', { id: '1' }, opts);
        await setTenantInCache('t2', { id: '2' }, opts);
        await setTenantInCache('t3', { id: '3' }, opts);
        // This 4th write should evict 't1' (oldest)
        await setTenantInCache('t4', { id: '4' }, opts);

        expect(await getTenantFromCache('t1', opts)).toBeNull();
        expect(await getTenantFromCache('t2', opts)).toEqual({ id: '2' });
        expect(await getTenantFromCache('t3', opts)).toEqual({ id: '3' });
        expect(await getTenantFromCache('t4', opts)).toEqual({ id: '4' });

        // Cleanup
        for (const k of ['t2', 't3', 't4']) await invalidateTenantCache(k);
    });

    it('evicts expired entries before falling back to oldest-entry eviction', async () => {
        vi.useFakeTimers();
        const opts = { driver: 'memory' as const, ttl: 1, maxMemoryEntries: 3 };

        await setTenantInCache('t1', { id: '1' }, opts);
        await setTenantInCache('t2', { id: '2' }, opts);
        await setTenantInCache('t3', { id: '3' }, opts);

        // Expire all three entries
        vi.advanceTimersByTime(2000);

        // 4th write — should sweep the three expired entries, then write t4
        await setTenantInCache('t4', { id: '4' }, opts);

        expect(await getTenantFromCache('t1', opts)).toBeNull();
        expect(await getTenantFromCache('t2', opts)).toBeNull();
        expect(await getTenantFromCache('t3', opts)).toBeNull();
        // t4 was set at fake-time 2000ms with ttl=1s → expires at 3000ms; still valid now
        expect(await getTenantFromCache('t4', opts)).toEqual({ id: '4' });
        vi.useRealTimers();

        await invalidateTenantCache('t4');
    });
});

// The 'nitro' driver is tested in cache-nitro.test.ts (requires mocking nitropack/runtime)

describe('invalidateTenantCacheAll (memory driver)', () => {
    it('clears all entries from the memory store', async () => {
        const opts = { driver: 'memory' as const, ttl: 60 };
        await setTenantInCache('a', { id: '1' }, opts);
        await setTenantInCache('b', { id: '2' }, opts);
        await setTenantInCache('c', { id: '3' }, opts);

        await invalidateTenantCacheAll(opts);

        expect(await getTenantFromCache('a', opts)).toBeNull();
        expect(await getTenantFromCache('b', opts)).toBeNull();
        expect(await getTenantFromCache('c', opts)).toBeNull();
    });

    it('does not throw when the store is already empty', async () => {
        await expect(invalidateTenantCacheAll({ driver: 'memory' })).resolves.toBeUndefined();
    });
});
