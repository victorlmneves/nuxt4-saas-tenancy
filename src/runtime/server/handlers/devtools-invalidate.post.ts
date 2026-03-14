import { defineEventHandler, createError, readBody } from 'h3';
import { invalidateTenantCache, invalidateTenantCacheAll } from '../utils/cache';

/**
 * Dev-only endpoint: invalidates one or all tenant cache entries.
 * Body: { key?: string }  — omit `key` to clear everything.
 * Registered at POST /_tenancy/devtools/invalidate by nuxt-saas-tenancy when devtools = true.
 */
export default defineEventHandler(async (event) => {
    if (!import.meta.dev) {
        throw createError({ statusCode: 404 });
    }

    const body = await readBody<{ key?: string }>(event).catch((): { key?: string } => ({}));

    if (body?.key) {
        await invalidateTenantCache(body.key);

        return { ok: true, invalidated: body.key };
    }

    await invalidateTenantCacheAll();

    return { ok: true, invalidated: 'all' };
});
