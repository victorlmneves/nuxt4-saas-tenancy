import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime';
import { getHeader, sendError, createError, sendRedirect, type H3Event } from 'h3';
import { getTenantFromCache, setTenantInCache, setCacheConfig } from '../utils/cache';
import type { Tenant } from '../../../types';
// @ts-expect-error virtual module - alias '#tenant-resolver' is registered by nuxt-saas-tenancy at build time
import resolverMod from '#tenant-resolver';

export default defineNitroPlugin((nitroApp) => {
    const config = useRuntimeConfig()._tenancy as {
        resolver: 'subdomain' | 'domain' | 'header' | 'custom';
        headerName: string;
        onNotFound: string;
        onError: string;
        cache: { driver: 'memory' | 'redis' | 'nitro'; ttl: number; redisUrl?: string };
        skipPaths: string[];
        baseDomain: string;
        reservedSubdomains: string[];
    };

    // Register the cache config globally so invalidateTenantCache() works
    // without callers having to re-pass opts on every call.
    setCacheConfig(config.cache);

    const resolverFn: (keyOrEvent: string | H3Event) => Promise<unknown> = resolverMod?._resolver ?? resolverMod;

    nitroApp.hooks.hook('request', async (event: H3Event) => {
        const path = event.path ?? '';

        // Skip static assets and Nuxt internals
        if (path.startsWith('/_nuxt/') || path.startsWith('/__nuxt') || path === '/favicon.ico') {
            return;
        }

        // Skip user-configured paths
        if (config.skipPaths?.some((prefix) => path === prefix || path.startsWith(prefix))) {
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

        type HooksWithCallHook = { callHook?: (name: string, ...args: unknown[]) => Promise<void> };
        const hooks = nitroApp.hooks as HooksWithCallHook;

        if (!tenantKey) {
            await hooks.callHook?.('tenancy:notFound', { event, key: null });

            return handleNotFound(event, config.onNotFound);
        }

        // Check cache first to avoid DB hit on every request
        const cached = await getTenantFromCache<Tenant>(tenantKey, config.cache);

        if (cached !== null) {
            // Respect active flag even on cached tenants — a deactivated tenant
            // should not be served even if it was cached before deactivation.
            if (cached.active === false) {
                await hooks.callHook?.('tenancy:notFound', { event, key: tenantKey });

                return handleNotFound(event, config.onNotFound);
            }

            event.context.tenant = cached;
            await hooks.callHook?.('tenancy:cacheHit', { event, tenant: cached, key: tenantKey });

            return;
        }

        // Call user's resolver.
        // In 'custom' mode the full H3Event is passed so the resolver can inspect
        // any part of the request (headers, path, query, etc.) to determine the tenant.
        let tenant: unknown = null;

        try {
            tenant = await (config.resolver === 'custom' ? resolverFn(event) : resolverFn(tenantKey));
        } catch (e) {
            console.error('[nuxt-saas-tenancy] Resolver threw:', e);

            if (config.onError?.startsWith('redirect:')) {
                return sendRedirect(event, config.onError.slice('redirect:'.length), 302);
            }

            return sendError(event, createError({ statusCode: 500, message: 'Tenant resolution failed' }));
        }

        if (!tenant) {
            await hooks.callHook?.('tenancy:notFound', { event, key: tenantKey });

            return handleNotFound(event, config.onNotFound);
        }

        // Treat explicitly deactivated tenants the same as not-found
        if ((tenant as Tenant).active === false) {
            await hooks.callHook?.('tenancy:notFound', { event, key: tenantKey });

            return handleNotFound(event, config.onNotFound);
        }

        await setTenantInCache(tenantKey, tenant, config.cache);

        event.context.tenant = tenant;
        await hooks.callHook?.('tenancy:resolved', {
            event,
            tenant: tenant as Tenant,
            key: tenantKey,
            fromCache: false,
        });
    });
});

function extractTenantKey(
    host: string,
    config: { resolver: string; headerName: string; baseDomain: string; reservedSubdomains: string[] }
): string | null {
    const hostname = host.split(':')[0];

    switch (config.resolver) {
        case 'subdomain': {
            // Strip baseDomain suffix when present (e.g. '.yoursaas.com'):
            //   'acme.yoursaas.com' → 'acme'
            // Without baseDomain, fall back to multipart split (supports local dev):
            //   'acme.localhost' → 'acme'
            const base = config.baseDomain ?? '';
            const effectiveHost = base && hostname!.endsWith(base) ? hostname!.slice(0, -base.length) : hostname!;
            const parts = effectiveHost.split('.');
            // After stripping baseDomain, 1 label is enough; otherwise require 2+
            const minParts = base && effectiveHost !== hostname ? 1 : 2;

            if (parts.length < minParts) {
                return null;
            }

            const subdomain = parts[0]!;

            if (!subdomain) {
                return null;
            }

            if (config.reservedSubdomains?.includes(subdomain)) {
                return null;
            }

            return subdomain;
        }
        case 'domain':
            return hostname || null;
        case 'custom':
            // The hostname is returned as the cache key; the actual resolver call
            // receives the full H3Event (done in the hook above).
            return hostname!;
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
