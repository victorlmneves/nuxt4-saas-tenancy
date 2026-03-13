import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime';
import { getHeader, sendError, createError, sendRedirect, type H3Event } from 'h3';
import { getTenantFromCache, setTenantInCache, setCacheConfig } from '../utils/cache';
// @ts-expect-error virtual module - alias '#tenant-resolver' is registered by nuxt-saas-tenancy at build time
import resolverMod from '#tenant-resolver';

export default defineNitroPlugin((nitroApp) => {
    const config = useRuntimeConfig()._tenancy as {
        resolver: 'subdomain' | 'domain' | 'header' | 'custom';
        headerName: string;
        onNotFound: string;
        cache: { driver: 'memory' | 'redis' | 'nitro'; ttl: number; redisUrl?: string };
    };

    // Register the cache config globally so invalidateTenantCache() works
    // without callers having to re-pass opts on every call.
    setCacheConfig(config.cache);

    const resolverFn: (host: string) => Promise<unknown> = resolverMod?._resolver ?? resolverMod;

    nitroApp.hooks.hook('request', async (event: H3Event) => {
        const path = event.path ?? '';

        // Skip static assets and Nuxt internals
        if (path.startsWith('/_nuxt/') || path.startsWith('/__nuxt') || path === '/favicon.ico') {
            return;
        }

        // Skip the redirect target itself to avoid infinite redirect loops
        if (config.onNotFound?.startsWith('redirect:')) {
            const redirectPath = config.onNotFound.slice('redirect:'.length);

            if (path === redirectPath || path.startsWith(redirectPath + '/') || path.startsWith(redirectPath + '?')) {
                event.context.tenant = null;

                return;
            }
        }

        const host = getHeader(event, 'host') ?? '';
        const tenantKey = config.resolver === 'header' ? (getHeader(event, config.headerName) ?? null) : extractTenantKey(host, config);

        if (!tenantKey) {
            return handleNotFound(event, config.onNotFound);
        }

        // Check cache first to avoid DB hit on every request
        const cached = await getTenantFromCache(tenantKey, config.cache);

        if (cached !== null) {
            event.context.tenant = cached;

            return;
        }

        // Call user's resolver
        let tenant: unknown = null;

        try {
            tenant = await resolverFn(tenantKey);
        } catch (e) {
            console.error('[nuxt-saas-tenancy] Resolver threw:', e);

            return sendError(event, createError({ statusCode: 500, message: 'Tenant resolution failed' }));
        }

        if (!tenant) {
            return handleNotFound(event, config.onNotFound);
        }

        await setTenantInCache(tenantKey, tenant, config.cache);

        event.context.tenant = tenant;
    });
});

function extractTenantKey(host: string, config: { resolver: string; headerName: string }): string | null {
    const hostname = host.split(':')[0];

    switch (config.resolver) {
        case 'subdomain': {
            const parts = hostname.split('.');

            // Accept both acme.example.com (3 parts) and acme.localhost (2 parts, local dev)
            return parts.length >= 2 ? parts[0] : null;
        }
        case 'domain':
            return hostname || null;
        case 'custom':
            return hostname;
        default:
            return null;
    }
}

async function handleNotFound(event: H3Event, onNotFound: string) {
    if (onNotFound === 'throw') {
        return sendError(event, createError({ statusCode: 404, message: 'Tenant not found' }));
    }

    if (onNotFound.startsWith('redirect:')) {
        return sendRedirect(event, onNotFound.slice('redirect:'.length), 302);
    }

    event.context.tenant = null;
}
