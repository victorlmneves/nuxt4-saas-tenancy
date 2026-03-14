import { defineEventHandler, createError } from 'h3';
import { useRuntimeConfig } from 'nitropack/runtime';
import { getTenantCacheStats } from '../utils/cache';
import { getResolutionEvents } from '../utils/eventLog';

/**
 * Dev-only endpoint: returns a JSON snapshot of the current tenancy config + cache state.
 * Registered at GET /_tenancy/devtools/data by nuxt-saas-tenancy when devtools = true.
 */
export default defineEventHandler(() => {
    if (!import.meta.dev) {
        throw createError({ statusCode: 404 });
    }

    const config = (useRuntimeConfig() as Record<string, unknown>)._tenancy ?? {};

    return {
        config,
        cache: getTenantCacheStats(),
        events: getResolutionEvents(),
        timestamp: Date.now(),
    };
});
