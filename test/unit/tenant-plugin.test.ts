import { describe, it, expect, vi } from 'vitest';

// Mock #app before importing the plugin.
const mockUseTenantRef = { value: { id: '1', name: 'Acme' } };
const mockUseTenant = vi.hoisted(() => vi.fn(() => mockUseTenantRef));
const mockDefineNuxtPlugin = vi.hoisted(() => vi.fn((setup: () => unknown) => setup));

vi.mock('#app', () => ({
    defineNuxtPlugin: mockDefineNuxtPlugin,
}));
vi.mock('../../src/runtime/composables/useTenant', () => ({
    useTenant: mockUseTenant,
}));

describe('tenant client plugin', () => {
    it('calls defineNuxtPlugin', async () => {
        await import('../../src/runtime/plugins/tenant');

        expect(mockDefineNuxtPlugin).toHaveBeenCalledOnce();
    });

    it('provides $tenant using the useTenant composable', async () => {
        // Simulate how Nuxt calls the plugin setup function
        const pluginSetup = mockDefineNuxtPlugin.mock.calls[0]?.[0] as () => { provide: { tenant: unknown } };
        const result = pluginSetup?.();

        expect(result).toEqual({ provide: { tenant: mockUseTenantRef } });
        expect(mockUseTenant).toHaveBeenCalled();
    });

    it('$tenant is the same ref returned by useTenant()', async () => {
        const pluginSetup = mockDefineNuxtPlugin.mock.calls[0]?.[0] as () => { provide: { tenant: unknown } };
        const result = pluginSetup?.();

        expect(result?.provide?.tenant).toBe(mockUseTenantRef);
    });
});
