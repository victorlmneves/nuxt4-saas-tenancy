<script setup lang="ts">
const tenant = useTenant();

useHead({
    title: tenant.value ? `${tenant.value.name} — Dashboard` : 'Loading...',
});

const { data: posts } = await useFetch<{ id: string; title: string; body: string; createdAt: string }[]>('/api/posts');

const blocked = useRoute().query.blocked;
</script>

<template>
    <div>
        <div v-if="tenant">
            <div class="page-title">
                <h1 class="page-title__heading">Welcome to {{ tenant.name }}</h1>
                <span class="plan-badge">{{ tenant.plan }}</span>
            </div>
            <p class="tenant-meta">ID: {{ tenant.id }} · {{ tenant.domain }}</p>

            <div v-if="blocked === 'plan'" class="alert alert--warning">Domain settings require a Pro or Enterprise plan.</div>

            <h2>Posts</h2>
            <ul v-if="posts?.length" class="post-list">
                <li v-for="post in posts" :key="post.id" class="post-card">
                    <strong>{{ post.title }}</strong>
                    <p class="post-card__body">{{ post.body }}</p>
                    <time class="post-card__date">{{ post.createdAt }}</time>
                </li>
            </ul>
            <p v-else class="empty-state">No posts yet.</p>
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

<style scoped>
.page-title {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
}

.page-title__heading {
    margin: 0;
}

.plan-badge {
    padding: var(--space-1) 10px;
    border-radius: var(--radius-pill);
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-inverse);
    background: var(--brand);
    text-transform: uppercase;
}

.tenant-meta {
    color: var(--color-text-muted);
    margin-top: var(--space-1);
}

.alert {
    border-radius: var(--radius-lg);
    padding: var(--space-3) var(--space-4);
    font-size: var(--font-size-sm);
    margin: var(--space-4) 0;
}

.alert--warning {
    background: var(--color-bg-warning);
}

.post-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.post-card {
    background: var(--color-bg-subtle);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    border-left: 4px solid var(--brand);
}

.post-card__body {
    margin: 6px 0 0;
    color: var(--color-text-dim);
    font-size: var(--font-size-sm);
}

.post-card__date {
    font-size: var(--font-size-xs);
    color: var(--color-text-subtle);
}

.empty-state {
    color: var(--color-text-subtle);
}
</style>
