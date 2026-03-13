<script setup lang="ts">
const tenant = useTenant();

useHead({
    title: () => tenant.value?.name ?? 'Loading…',
    style: [
        {
            innerHTML: () => (tenant.value ? `:root { --brand: ${tenant.value.brandColor}; }` : ''),
            tagPriority: 'critical',
        },
    ],
});
</script>

<template>
    <div style="font-family: sans-serif; min-height: 100vh">
        <header
            style="
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 24px;
                height: 56px;
                background: var(--brand, #333);
                color: white;
            "
        >
            <span style="font-weight: 700; font-size: 18px">
                {{ tenant?.name }}
            </span>
            <nav style="display: flex; gap: 16px">
                <NuxtLink to="/" style="color: white; text-decoration: none; opacity: 0.9">Dashboard</NuxtLink>
                <NuxtLink to="/settings/domain" style="color: white; text-decoration: none; opacity: 0.9">Domain Settings</NuxtLink>
            </nav>
        </header>

        <main style="max-width: 720px; margin: 40px auto; padding: 0 24px">
            <slot />
        </main>
    </div>
</template>
