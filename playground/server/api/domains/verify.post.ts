export default defineEventHandler(async (event) => {
    const { domain } = await readBody(event);
    const verified = await verifyCustomDomain(domain, {
        method: 'cname',
        expectedTarget: 'cname.yoursaas.com',
    });

    if (verified) {
        // Invalidate the tenant cache when a domain is verified
        await invalidateTenantCache(domain);
    }

    return { verified, domain };
});
