import { useNuxtApp, useState } from '#app';
import type { Tenant } from '../../types';

/**
 * Universal composable — works on both server and client without hydration mismatches.
 *
 * On the server, the tenant is injected by the Nitro plugin into the Nuxt SSR context.
 * On the client, it's rehydrated from the payload.
 * @returns {import('vue').Ref<import('../../types').Tenant | null>} A reactive reference to the current tenant or null if not found
 * @example
 * <script setup>
 * const tenant = useTenant()
 * useHead({ title: tenant.value?.name })
 * </script>
 */
export function useTenant() {
    // useState provides SSR-safe shared state with automatic payload transfer.
    // JSON round-trip ensures the value is a plain POJO so devalue can serialize
    // it into the SSR payload without throwing "cannot stringify non-POJOs".
    return useState<Tenant | null>('__nuxt_tenant', () => {
        if (process.server) {
            const nuxtApp = useNuxtApp();
            const tenant = nuxtApp.ssrContext?.event?.context?.tenant ?? null;

            if (!tenant) {
                return null;
            }

            return JSON.parse(JSON.stringify(tenant)) as Tenant;
        }

        return null;
    });
}
