import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTenantFromCache, setTenantInCache, invalidateTenantCache } from '../../src/runtime/server/utils/cache';

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
});

// The 'nitro' driver is tested in cache-nitro.test.ts (requires mocking nitropack/runtime)
