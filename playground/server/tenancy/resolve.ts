// defineTenantResolver is provided by nuxt-saas-tenancy (injected globally at startup)
// Simulated DB — replace with your actual database query
const TENANTS: Record<string, object> = {
    acme: {
        id: '1',
        name: 'Acme Corp',
        domain: 'acme',
        brandColor: '#e74c3c',
        plan: 'pro',
        logoUrl: null,
    },
    globex: {
        id: '2',
        name: 'Globex',
        domain: 'globex',
        brandColor: '#2ecc71',
        plan: 'enterprise',
        logoUrl: null,
    },
    initech: {
        id: '3',
        name: 'Initech',
        domain: 'initech',
        brandColor: '#3498db',
        plan: 'free',
        logoUrl: null,
    },
};

export default defineTenantResolver(async (key) => {
    // Simulate async DB lookup
    await new Promise((r) => setTimeout(r, 5));

    return TENANTS[key] ?? null;
});
