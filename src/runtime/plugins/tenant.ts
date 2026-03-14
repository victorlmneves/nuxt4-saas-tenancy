import { defineNuxtPlugin } from '#app';
import type { Ref } from 'vue';
import type { Tenant } from '../../types';
import { useTenant } from '../composables/useTenant';

/**
 * Provides `$tenant` on the NuxtApp instance so it is accessible as
 * `useNuxtApp().$tenant` and as `$tenant` in templates.
 *
 * The value is the same `Ref<Tenant | null>` returned by `useTenant()`,
 * so it is reactive and shares state with the composable.
 */
export default defineNuxtPlugin((): { provide: { tenant: Ref<Tenant | null> } } => {
    return {
        provide: {
            tenant: useTenant(),
        },
    };
});
