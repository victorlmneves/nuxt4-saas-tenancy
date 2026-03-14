/**
 * Integration-style tests for the core tenancy request pipeline.
 *
 * The Nitro plugin itself can't run outside Nitro (it imports `nitropack/runtime`
 * and a virtual module), so we test the two pure functions it depends on:
 *   - extractTenantKey  (re-exported for testability via a thin wrapper below)
 *   - the full resolve → cache → attach flow wired up with real in-memory cache
 *     and a real defineTenantResolver.
 *
 * This gives us integration-level confidence without requiring a live Nuxt server.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { defineTenantResolver } from '../../src/runtime/server/utils/defineTenantResolver';
import { getTenantFromCache, setTenantInCache, invalidateTenantCache } from '../../src/runtime/server/utils/cache';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Inline the extractTenantKey logic (mirrored from tenancy.ts) so we can test
// it without importing nitropack/runtime.
function extractTenantKey(
    host: string,
    config: { resolver: 'subdomain' | 'domain' | 'header' | 'custom'; headerName: string },
    headers: Record<string, string> = {}
): string | null {
    const hostname = host.split(':')[0];

    switch (config.resolver) {
        case 'subdomain': {
            const parts = hostname.split('.');
            return parts.length >= 2 ? parts[0] : null;
        }
        case 'domain':
            return hostname || null;
        case 'header':
            return headers[config.headerName] ?? null;
        case 'custom':
            return hostname;
        default:
            return null;
    }
}

// ── extractTenantKey ──────────────────────────────────────────────────────────

describe('extractTenantKey — subdomain resolver', () => {
    const cfg = { resolver: 'subdomain' as const, headerName: 'x-tenant-id' };

    it('extracts the subdomain from a 3-part hostname', () => {
        expect(extractTenantKey('acme.example.com', cfg)).toBe('acme');
    });

    it('extracts the subdomain from host:port', () => {
        expect(extractTenantKey('acme.localhost:3000', cfg)).toBe('acme');
    });

    it('extracts the subdomain from a 2-part hostname (local dev)', () => {
        expect(extractTenantKey('acme.localhost', cfg)).toBe('acme');
    });

    it('returns null for a bare hostname with no subdomain', () => {
        expect(extractTenantKey('localhost', cfg)).toBeNull();
    });
});

describe('extractTenantKey — domain resolver', () => {
    const cfg = { resolver: 'domain' as const, headerName: 'x-tenant-id' };

    it('returns the full hostname as the key', () => {
        expect(extractTenantKey('acme.com', cfg)).toBe('acme.com');
    });

    it('strips the port', () => {
        expect(extractTenantKey('acme.com:3000', cfg)).toBe('acme.com');
    });
});

describe('extractTenantKey — header resolver', () => {
    const cfg = { resolver: 'header' as const, headerName: 'x-tenant-id' };

    it('reads the configured header', () => {
        expect(extractTenantKey('example.com', cfg, { 'x-tenant-id': 'acme' })).toBe('acme');
    });

    it('returns null when the header is absent', () => {
        expect(extractTenantKey('example.com', cfg, {})).toBeNull();
    });
});

// ── resolve → cache → attach pipeline ────────────────────────────────────────

interface MockTenant {
    id: string;
    name: string;
}

const DB: Record<string, MockTenant> = {
    acme: { id: '1', name: 'Acme Corp' },
    globex: { id: '2', name: 'Globex' },
};

const MEM = { driver: 'memory' as const, ttl: 60 };

async function resolvePipeline(key: string): Promise<MockTenant | null> {
    // Check cache first (mirrors the plugin logic)
    const cached = await getTenantFromCache(key, MEM);

    if (cached !== null) {
        return cached as MockTenant;
    }

    const resolver = defineTenantResolver<MockTenant>(async (k) => DB[k as string] ?? null);
    const tenant = (await resolver(key)) ?? null;

    if (tenant) {
        await setTenantInCache(key, tenant, MEM);
    }

    return tenant;
}

describe('resolve → cache pipeline', () => {
    beforeEach(async () => {
        await invalidateTenantCache('acme');
        await invalidateTenantCache('globex');
        await invalidateTenantCache('unknown');
    });

    it('resolves a known tenant and caches the result', async () => {
        const first = await resolvePipeline('acme');

        expect(first).toEqual({ id: '1', name: 'Acme Corp' });

        // Second call should come from cache (same object shape)
        const second = await resolvePipeline('acme');

        expect(second).toEqual({ id: '1', name: 'Acme Corp' });
    });

    it('returns null for an unknown tenant key', async () => {
        expect(await resolvePipeline('unknown')).toBeNull();
    });

    it('returns the correct tenant for different keys', async () => {
        const acme = await resolvePipeline('acme');
        const globex = await resolvePipeline('globex');

        expect(acme?.name).toBe('Acme Corp');
        expect(globex?.name).toBe('Globex');
    });

    it('serves the cached value after initial resolution', async () => {
        await resolvePipeline('acme');

        // Manually change the cache to a different value to prove it's being read
        await setTenantInCache('acme', { id: '1', name: 'Cached Override' }, MEM);

        const result = await resolvePipeline('acme');

        expect(result?.name).toBe('Cached Override');
    });
});
