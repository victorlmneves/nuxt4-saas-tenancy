import {
    defineNuxtModule,
    addPlugin,
    addServerPlugin,
    addImports,
    addServerImports,
    addServerHandler,
    createResolver,
    addTypeTemplate,
    addTemplate,
    resolvePath,
} from '@nuxt/kit';
import { defu } from 'defu';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// jiti v1 (used by @nuxt/module-builder stub mode) doesn't support import.meta.
// This shim falls back to __dirname (available in CJS/jiti context) when needed.
const _filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const _dirname = typeof __dirname !== 'undefined' ? __dirname : dirname(_filename);

export interface TenancyCacheOptions {
    driver: 'memory' | 'redis' | 'nitro';
    ttl?: number;
    redisUrl?: string;
    /**
     * Maximum number of entries held in the in-memory store before oldest-entry eviction triggers.
     * @default 500
     */
    maxMemoryEntries?: number;
}

export interface ModuleOptions {
    /**
     * How to extract the tenant identifier from the incoming request.
     * - 'subdomain': uses the first segment of the hostname (e.g. acme.yoursaas.com → 'acme')
     * - 'domain':    uses the full hostname (e.g. acme.com)
     * - 'header':    reads a custom header (requires `headerName`)
     * - 'custom':    delegate entirely to your resolver
     */
    resolver: 'subdomain' | 'domain' | 'header' | 'custom';

    /**
     * Only used when resolver = 'header'.
     * @remarks **Security**: The `header` resolver is suitable only in environments
     * where a trusted reverse-proxy sets this header and direct client access is blocked.
     * An attacker with direct access to your origin can spoof this header and impersonate
     * any tenant. Ensure your infrastructure strips the header from untrusted requests.
     */
    headerName?: string;

    /**
     * Path to your tenant resolver file (relative to project root).
     * Must export a default `defineTenantResolver(...)` call.
     */
    resolveTenant: string;

    /** Cache resolved tenants to avoid a DB hit on every request */
    cache?: TenancyCacheOptions;

    /**
     * What to do when the resolved tenant is null/undefined.
     * - 'throw':         send a 404 response
     * - 'redirect:/path': redirect to a URL
     * - 'null':           pass null through (you handle it yourself)
     */
    onNotFound?: 'throw' | `redirect:${string}` | 'null';

    /**
     * What to do when the tenant **resolver throws** an unexpected error.
     * - 'throw':          return a 500 response (default)
     * - 'redirect:/path': redirect to a URL
     * @default 'throw'
     */
    onError?: 'throw' | `redirect:${string}`;

    /**
     * URL path prefixes that bypass tenant resolution entirely.
     * The built-in Nuxt internals (`/_nuxt`, `/__nuxt`, `/favicon.ico`) are
     * always skipped and do not need to be listed here.
     * @example ['/_api/health', '/webhooks/']
     */
    skipPaths?: string[];

    /**
     * Base domain suffix to strip when using the `subdomain` resolver.
     * Include the leading dot, e.g. `'.yoursaas.com'`.
     * `'acme.yoursaas.com'` → key `'acme'` instead of split-based extraction.
     * Has no effect on other resolver modes.
     */
    baseDomain?: string;

    /**
     * Subdomains that should never be treated as tenant identifiers.
     * Requests arriving on these subdomains are treated as not-found.
     * Only applies to the `subdomain` resolver.
     * @example ['www', 'api', 'mail', 'status']
     */
    reservedSubdomains?: string[];

    /**
     * If true, a DevTools panel is added showing tenant info + cache stats.
     * Defaults to true in development.
     */
    devtools?: boolean;
}

export default defineNuxtModule<ModuleOptions>({
    meta: {
        name: 'nuxt-saas-tenancy',
        configKey: 'tenancy',
        // Supports Nuxt 3 and Nuxt 4 — do NOT pin to "nuxt 3" in the name or docs
        compatibility: { nuxt: '>=3.0.0' },
    },

    defaults: {
        resolver: 'subdomain',
        resolveTenant: '~/server/tenancy/resolve',
        cache: { driver: 'memory', ttl: 60 },
        onNotFound: 'throw',
        onError: 'throw' as 'throw' | `redirect:${string}`,
        skipPaths: [] as string[],
        baseDomain: '',
        reservedSubdomains: [] as string[],
        devtools: process.env.NODE_ENV === 'development',
    },

    async setup(options, nuxt) {
        const { resolve } = createResolver(_dirname);

        // Resolve the user's resolver file to an absolute path.
        // Strip common Nuxt path aliases (~ @ ~~ @@) before resolving so that
        // '~/server/tenancy/resolve' works in both Nuxt 3 (srcDir=rootDir) and
        // Nuxt 4 (srcDir=app/) — server files always live under rootDir/server/.
        let rawResolverPath = options.resolveTenant;

        for (const alias of ['~~', '@@', '~', '@']) {
            if (rawResolverPath.startsWith(`${alias}/`) || rawResolverPath === alias) {
                rawResolverPath = rawResolverPath.slice(alias.length + 1);

                break;
            }
        }

        const resolvedResolverPath = await resolvePath(rawResolverPath, {
            cwd: nuxt.options.rootDir,
        });

        // Create a virtual module template so Nitro can statically bundle the resolver.
        // We inline a minimal defineTenantResolver shim and assign it to globalThis BEFORE
        // the user's resolver file is dynamically imported — ensuring the global exists even
        // when Nitro (in dev mode) loads the file as raw Node.js ESM, bypassing Vite's
        // unimport auto-import transform that would normally inject the global.
        const resolverTemplate = addTemplate({
            filename: 'nuxt-saas-tenancy/resolver.mjs',
            write: true,
            getContents: () =>
                [
                    `// Inline shim — avoids importing a .ts source file from plain Node.js ESM`,
                    `globalThis.defineTenantResolver = function defineTenantResolver(fn) {`,
                    `  const wrapped = async (key) => fn(key)`,
                    `  wrapped._resolver = wrapped`,
                    `  return wrapped`,
                    `}`,
                    `const _mod = await import('${resolvedResolverPath}')`,
                    `export default _mod.default`,
                ].join('\n'),
        });

        // Register '#tenant-resolver' as a Nitro alias pointing to the template
        nuxt.hook('nitro:config', (nitroConfig) => {
            nitroConfig.alias ??= {};
            (nitroConfig.alias as Record<string, string>)['#tenant-resolver'] = resolverTemplate.dst;
        });

        // Detect whether we're running under Nuxt 4 (app/ dir) or Nuxt 3 (flat root)
        // Module runtime code itself is identical — only the playground structure differs.
        // We expose this flag so consumers can reference it if needed.
        const isNuxt4 =
            nuxt.options._majorVersion !== undefined
                ? nuxt.options._majorVersion >= 4
                : 'future' in nuxt.options &&
                    nuxt.options.future &&
                    'compatibilityVersion' in nuxt.options.future &&
                    typeof nuxt.options.future.compatibilityVersion === 'number'
                  ? nuxt.options.future.compatibilityVersion >= 4
                  : false;

        nuxt.options.runtimeConfig._tenancyIsNuxt4 = isNuxt4;

        // Merge options into runtimeConfig so Nitro plugins can read them
        nuxt.options.runtimeConfig._tenancy = defu(nuxt.options.runtimeConfig._tenancy ?? {}, {
            resolver: options.resolver,
            headerName: options.headerName ?? 'x-tenant-id',
            onNotFound: options.onNotFound,
            onError: options.onError ?? 'throw',
            cache: options.cache,
            skipPaths: options.skipPaths ?? [],
            baseDomain: options.baseDomain ?? '',
            reservedSubdomains: options.reservedSubdomains ?? [],
        });

        // ── Client-side ──────────────────────────────────────────────────────────

        // Plugin that provides $tenant on the NuxtApp instance
        addPlugin(resolve('./runtime/plugins/tenant'));

        // ── Server-side ──────────────────────────────────────────────────────────

        // Nitro plugin that runs on every request and resolves the tenant
        addServerPlugin(resolve('./runtime/server/plugins/tenancy'));

        // Auto-import server utilities
        addServerImports([
            {
                name: 'useTenant',
                from: resolve('./runtime/server/utils/useTenant'),
            },
            {
                name: 'useTenantOrNull',
                from: resolve('./runtime/server/utils/useTenant'),
            },
            {
                name: 'defineTenantResolver',
                from: resolve('./runtime/server/utils/defineTenantResolver'),
            },
            {
                name: 'defineTenantEventHandler',
                from: resolve('./runtime/server/utils/defineTenantEventHandler'),
            },
            {
                name: 'verifyCustomDomain',
                from: resolve('./runtime/server/utils/verifyCustomDomain'),
            },
            {
                name: 'invalidateTenantCache',
                from: resolve('./runtime/server/utils/cache'),
            },
            {
                name: 'invalidateTenantCacheAll',
                from: resolve('./runtime/server/utils/cache'),
            },
        ]);

        // ── Client / Universal composables ──────────────────────────────────────

        addImports({
            name: 'useTenant',
            from: resolve('./runtime/composables/useTenant'),
        });

        // ── TypeScript augmentations ─────────────────────────────────────────────

        addTypeTemplate({
            filename: 'types/nuxt-saas-tenancy.d.ts',
            getContents: () =>
                `
// Generated by nuxt-saas-tenancy
import type { Tenant } from 'nuxt-saas-tenancy'
import type { H3Event } from 'h3'

declare module 'h3' {
  interface H3EventContext {
    /** Resolved tenant for the current request. Null only when onNotFound = 'null'. */
    tenant: Tenant | null
  }
}

declare module '#app' {
  interface NuxtApp {
    /** Reactive ref to the current tenant. Alias for useTenant(). */
    $tenant: import('vue').Ref<Tenant | null>
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Fired after a tenant is freshly resolved (not from cache). */
    'tenancy:resolved': (ctx: { event: H3Event; tenant: Tenant; key: string; fromCache: boolean }) => void
    /** Fired when a tenant is served from the in-request cache. */
    'tenancy:cacheHit': (ctx: { event: H3Event; tenant: Tenant; key: string }) => void
    /** Fired when no tenant could be resolved (null return, active=false, or unknown host). */
    'tenancy:notFound': (ctx: { event: H3Event; key: string | null }) => void
  }
}

export {}
      `.trim(),
        });

        // ── DevTools panel ───────────────────────────────────────────────────────
        //
        // Registers three dev-only server routes:
        //   GET  /_tenancy/devtools        → self-contained HTML panel (iframe)
        //   GET  /_tenancy/devtools/data   → JSON snapshot: config + cache stats
        //   POST /_tenancy/devtools/invalidate → flush one or all cache entries
        //
        // A custom tab is added to Nuxt DevTools that embeds the panel as an iframe.
        // All handlers return 404 in production even if devtools is accidentally left true.

        if (options.devtools) {
            addServerHandler({
                route: '/_tenancy/devtools',
                handler: resolve('./runtime/server/handlers/devtools-panel.get'),
                method: 'get',
            });

            addServerHandler({
                route: '/_tenancy/devtools/data',
                handler: resolve('./runtime/server/handlers/devtools-data.get'),
                method: 'get',
            });

            addServerHandler({
                route: '/_tenancy/devtools/invalidate',
                handler: resolve('./runtime/server/handlers/devtools-invalidate.post'),
                method: 'post',
            });

            // Hook into Nuxt DevTools to register a custom tab.
            // The tab is an iframe pointing at the panel route above.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (nuxt as any).hook('devtools:customTabs', (tabs: any[]) => {
                tabs.push({
                    name: 'nuxt-saas-tenancy',
                    title: 'Tenancy',
                    icon: 'carbon:tenant',
                    view: {
                        type: 'iframe',
                        src: '/_tenancy/devtools',
                    },
                });
            });
        }
    },
});
