export default defineNuxtConfig({
    modules: ['../src/module'],

    compatibilityDate: '2026-03-12',

    // Nuxt 4: source files live in app/ by default.
    // Remove or comment this out if using Nuxt 3 (flat structure).
    future: {
        compatibilityVersion: 4,
    },

    tenancy: {
        resolver: 'subdomain',
        resolveTenant: '~/server/tenancy/resolve',
        cache: { driver: 'memory', ttl: 30 },
        onNotFound: 'redirect:/no-tenant',
    },
});
