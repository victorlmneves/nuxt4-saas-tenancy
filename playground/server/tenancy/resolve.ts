// defineTenantResolver is provided by nuxt-saas-tenancy (injected globally at startup)
// Simulated DB — replace with your actual database query
const TENANTS: Record<string, object> = {
    acme: {
        id: '1',
        name: 'Acme Corp',
        domain: 'acme',
        plan: 'pro',
        logoUrl: null,
        theme: {
            colorBrand: '#e74c3c',
            colorBrandText: '#fff',
            colorBgPage: '#fff',
            fontSans: 'Georgia, "Times New Roman", serif',
            radiusMd: '2px',
            radiusPill: '2px',
        },
    },
    globex: {
        id: '2',
        name: 'Globex',
        domain: 'globex',
        plan: 'enterprise',
        logoUrl: null,
        theme: {
            colorBrand: '#1a1a2e',
            colorBrandText: '#00d4aa',
            colorBgPage: '#f0f4f8',
            fontSans: '"Inter", system-ui, sans-serif',
            radiusMd: '12px',
            radiusPill: '999px',
        },
    },
    initech: {
        id: '3',
        name: 'Initech',
        domain: 'initech',
        plan: 'free',
        logoUrl: null,
        theme: {
            colorBrand: '#3498db',
            colorBrandText: '#fff',
            colorBgPage: '#fff',
            fontSans: '"Courier New", Courier, monospace',
            radiusMd: '0px',
            radiusPill: '0px',
        },
    },
};

export default defineTenantResolver(async (key) => {
    // Simulate async DB lookup
    await new Promise((r) => setTimeout(r, 5));

    return TENANTS[key] ?? null;
});
