// Blocks free-plan tenants from accessing /settings/* routes.
// Pro/Enterprise tenants pass through unconditionally.
export default defineNuxtRouteMiddleware((to) => {
    const tenant = useTenant();

    if (to.path.startsWith('/settings') && tenant.value?.plan === 'free') {
        return navigateTo('/?blocked=plan');
    }
});
