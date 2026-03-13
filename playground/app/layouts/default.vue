<script setup lang="ts">
const tenant = useTenant();

useHead(() => ({
    title: tenant.value?.name ?? 'Loading…',
    link: tenant.value ? [{ key: 'tenant-theme', rel: 'stylesheet', href: `/_tenant/${tenant.value.id}/theme.css` }] : [],
}));
</script>

<template>
    <div class="layout">
        <header class="navbar">
            <span class="navbar__brand">{{ tenant?.name }}</span>
            <nav class="navbar__nav">
                <NuxtLink to="/" class="navbar__link">Dashboard</NuxtLink>
                <NuxtLink to="/settings/domain" class="navbar__link">Domain Settings</NuxtLink>
            </nav>
        </header>

        <main class="layout__main">
            <slot />
        </main>
    </div>
</template>

<style scoped>
.layout {
    min-height: 100vh;
    background: var(--color-bg-page);
}

.navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-5);
    height: 56px;
    background: var(--brand);
    color: var(--brand-text);
}

.navbar__brand {
    font-weight: 700;
    font-size: var(--font-size-lg);
    font-family: var(--font-sans);
}

.navbar__nav {
    display: flex;
    gap: var(--space-4);
}

.navbar__link {
    color: var(--brand-text);
    text-decoration: none;
    opacity: 0.9;
    font-family: var(--font-sans);
}

.navbar__link:hover {
    opacity: 1;
}

.layout__main {
    max-width: 720px;
    margin: var(--space-6) auto;
    padding: 0 var(--space-5);
    font-family: var(--font-sans);
}
</style>
