import { describe, it, expect, vi, afterEach } from 'vitest';
import { useState, useNuxtApp } from '#app';
import { useTenant } from '../../src/runtime/composables/useTenant';

// Mock #app before importing the composable.
// useState is mocked to immediately invoke the factory (no SSR state sharing needed in tests).
vi.mock('#app', () => ({
    useState: vi.fn((_key: string, factory?: () => unknown) => ({ value: factory?.() ?? null })),
    useNuxtApp: vi.fn(),
}));

afterEach(() => {
    vi.clearAllMocks();
    // Reset process.server after each test so server-side tests don't bleed into each other
    delete (process as unknown as Record<string, unknown>).server;
});

describe('useTenant composable', () => {
    it('returns null on the client side (process.server is falsy)', () => {
        // Default test env: process.server is undefined → client path
        const result = useTenant();

        expect(result.value).toBeNull();
        expect(vi.mocked(useNuxtApp)).not.toHaveBeenCalled();
    });

    it('returns the tenant from the SSR context on the server', () => {
        (process as unknown as Record<string, unknown>).server = true;
        const tenant = { id: '1', name: 'Acme Corp' };
        vi.mocked(useNuxtApp).mockReturnValue({
            ssrContext: { event: { context: { tenant } } },
        } as ReturnType<typeof useNuxtApp>);

        const result = useTenant();

        expect(result.value).toEqual(tenant);
    });

    it('returns a JSON-round-tripped plain object, not the original reference', () => {
        (process as unknown as Record<string, unknown>).server = true;
        const original = { id: '1', name: 'Acme Corp' };
        vi.mocked(useNuxtApp).mockReturnValue({
            ssrContext: { event: { context: { tenant: original } } },
        } as ReturnType<typeof useNuxtApp>);

        const result = useTenant();

        expect(result.value).toEqual(original);
        expect(result.value).not.toBe(original);
    });

    it('returns null on the server when event.context.tenant is null', () => {
        (process as unknown as Record<string, unknown>).server = true;
        vi.mocked(useNuxtApp).mockReturnValue({
            ssrContext: { event: { context: { tenant: null } } },
        } as ReturnType<typeof useNuxtApp>);

        const result = useTenant();

        expect(result.value).toBeNull();
    });

    it('returns null on the server when ssrContext is absent', () => {
        (process as unknown as Record<string, unknown>).server = true;
        vi.mocked(useNuxtApp).mockReturnValue({
            ssrContext: null,
        } as ReturnType<typeof useNuxtApp>);

        const result = useTenant();

        expect(result.value).toBeNull();
    });

    it('passes the key "__nuxt_tenant" to useState', () => {
        useTenant();

        expect(vi.mocked(useState)).toHaveBeenCalledWith('__nuxt_tenant', expect.any(Function));
    });
});
