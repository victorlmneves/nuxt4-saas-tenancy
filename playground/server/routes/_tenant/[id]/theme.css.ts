export default defineEventHandler(async (event) => {
    const tenant = event.context.tenant;

    setHeader(event, 'Content-Type', 'text/css; charset=utf-8');

    // Validate the ID in the URL matches the resolved tenant so a stale link
    // from one tenant can never serve another tenant's theme.
    const requestedId = getRouterParam(event, 'id');

    if (!tenant || tenant.id !== requestedId) {
        setHeader(event, 'Cache-Control', 'no-store');

        return '';
    }

    // Each tenant ID is unique in the URL — safe to cache aggressively.
    setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600');

    const vars = Object.entries(tenant.theme)
        .map(([k, v]) => `  --${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${String(v)};`)
        .join('\n');

    return `:root {\n${vars}\n}\n`;
});
