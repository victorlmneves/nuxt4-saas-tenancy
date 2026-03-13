<script setup lang="ts">
definePageMeta({ layout: false });
</script>

<template>
    <div style="font-family: sans-serif; padding: 2rem">
        <h1>No tenant found</h1>
        <p>
            This app uses subdomain-based tenancy. Try visiting with a subdomain, e.g.
            <a href="http://acme.localhost:3000">acme.localhost:3000</a>
            or
            <a href="http://globex.localhost:3000">globex.localhost:3000</a>
            .
        </p>
    </div>
</template>
