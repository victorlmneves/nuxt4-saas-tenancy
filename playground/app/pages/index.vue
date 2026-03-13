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
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px">
                <h1 style="margin: 0">Welcome to {{ tenant.name }}</h1>
                <span
                    style="
                        padding: 2px 10px;
                        border-radius: 20px;
                        font-size: 12px;
                        font-weight: 600;
                        color: white;
                        background: var(--brand, #333);
                        text-transform: uppercase;
                    "
                >
                    {{ tenant.plan }}
                </span>
            </div>
            <p style="color: #777; margin-top: 4px">ID: {{ tenant.id }} · {{ tenant.domain }}</p>

            <div
                v-if="blocked === 'plan'"
                style="margin: 16px 0; padding: 12px 16px; background: #fff3cd; border-radius: 8px; font-size: 14px"
            >
                Domain settings require a Pro or Enterprise plan.
            </div>

            <h2>Posts</h2>
            <ul v-if="posts?.length" style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px">
                <li
                    v-for="post in posts"
                    :key="post.id"
                    style="background: #f9f9f9; border-radius: 8px; padding: 16px; border-left: 4px solid var(--brand, #333)"
                >
                    <strong>{{ post.title }}</strong>
                    <p style="margin: 6px 0 0; color: #555; font-size: 14px">{{ post.body }}</p>
                    <time style="font-size: 12px; color: #999">{{ post.createdAt }}</time>
                </li>
            </ul>
            <p v-else style="color: #999">No posts yet.</p>
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
