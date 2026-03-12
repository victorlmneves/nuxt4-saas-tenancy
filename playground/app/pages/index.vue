<script setup lang="ts">
const tenant = useTenant();

useHead({
    title: tenant.value ? `${tenant.value.name} — Dashboard` : 'Loading...',
});

const { data } = await useFetch('/api/tenant');
</script>

<template>
    <div style="font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px">
        <div v-if="tenant">
            <div
                style="padding: 4px 12px; border-radius: 4px; display: inline-block; color: white; font-size: 12px; margin-bottom: 16px"
                :style="{ backgroundColor: tenant.brandColor ?? '#666' }"
            >
                {{ tenant.plan?.toUpperCase() }}
            </div>
            <h1>Welcome to {{ tenant.name }}</h1>
            <p style="color: #666">Tenant ID: {{ tenant.id }} · Domain: {{ tenant.domain }}</p>
            <pre style="background: #f5f5f5; padding: 16px; border-radius: 8px; overflow: auto">{{ JSON.stringify(data, null, 2) }}</pre>
        </div>
        <div v-else>
            <h1>No tenant found</h1>
            <p>
                Try accessing via a subdomain like
                <code>acme.localhost:3000</code>
            </p>
        </div>
    </div>
</template>
