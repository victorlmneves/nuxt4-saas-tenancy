import {
    defineNuxtModule,
    addServerPlugin,
    addImports,
    addServerImports,
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

    /** Only used when resolver = 'header' */
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
            nitroConfig.alias = nitroConfig.alias ?? {};
            nitroConfig.alias['#tenant-resolver'] = resolverTemplate.dst;
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
            cache: options.cache,
        });

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
                name: 'verifyCustomDomain',
                from: resolve('./runtime/server/utils/verifyCustomDomain'),
            },
            {
                name: 'invalidateTenantCache',
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
import type { Tenant } from 'nuxt-saas-tenancy/types'

declare module 'h3' {
  interface H3EventContext {
    /** Resolved tenant for the current request. Null only when onNotFound = 'null'. */
    tenant: Tenant | null
  }
}

declare module '#app' {
  interface NuxtApp {
    $tenant: Tenant | null
  }
}

export {}
      `.trim(),
        });

        // ── DevTools panel ───────────────────────────────────────────────────────

        if (
            options.devtools &&
            nuxt.options.devtools &&
            typeof nuxt.options.devtools !== 'boolean' &&
            nuxt.options.devtools.enabled !== false
        ) {
            // DevTools integration would be added here via @nuxt/devtools-kit
            // Kept as a stub for the initial release
        }
    },
});
