# nuxt-saas-tenancy

> Dynamic multi-tenancy for Nuxt. Runtime tenant resolution, smart caching, custom domain verification, and SSR-safe composables — all in one module.

## Compatibility

| Nuxt version | Supported |
| ------------ | --------- |
| Nuxt 3.x     | ✅        |
| Nuxt 4.x     | ✅        |

## The problem

Most Nuxt multi-tenancy setups either:

- Require all tenants to be known at **build time**
- Force everything into a single `[site]` folder with manual hostname checks
- Don't handle **custom domains** (e.g. `acme.com` → your SaaS)
- Miss SSR — causing hydration mismatches or double DB calls

This module solves all of that.

---

## Install

```bash
npx nuxi module add nuxt-saas-tenancy
```

## Setup

```ts
// nuxt.config.ts
export default defineNuxtConfig({
    modules: ['nuxt-saas-tenancy'],

    // Nuxt 4 only: enables the app/ directory structure.
    // Remove this block if you're on Nuxt 3.
    future: {
        compatibilityVersion: 4,
    },

    tenancy: {
        resolver: 'subdomain', // 'subdomain' | 'domain' | 'header' | 'custom'
        // headerName: 'x-tenant-id',   // only used when resolver = 'header'
        resolveTenant: '~/server/tenancy/resolve',
        cache: { driver: 'memory', ttl: 60 },
        onNotFound: 'throw', // 'throw' | 'redirect:/404' | 'null'
    },
});
```

> **Nuxt 4 note:** pages, composables, and components live under `app/`. The `server/` folder stays at the root — same as Nuxt 3. The module runtime works identically in both versions.

## 1. Define your resolver

```ts
// server/tenancy/resolve.ts  ← same path in Nuxt 3 and 4
import { defineTenantResolver } from 'nuxt-saas-tenancy';

export default defineTenantResolver(async (key) => {
    // key = subdomain or full domain depending on your resolver setting
    return await db.query.tenants.findFirst({
        where: eq(tenants.domain, key),
    });
});
```

## 2. Use in API routes

```ts
// server/api/dashboard.get.ts
export default defineEventHandler(async (event) => {
    const tenant = useTenant(event); // typed, cached, throws if not found

    return db.query.posts.findMany({
        where: eq(posts.tenantId, tenant.id),
    });
});
```

## 3. Use in Vue pages (SSR-safe)

```vue
<!-- Nuxt 3: pages/index.vue  |  Nuxt 4: app/pages/index.vue -->
<script setup>
const tenant = useTenant(); // Ref<Tenant | null>

useHead({ title: tenant.value?.name });
</script>

<template>
    <h1>Welcome to {{ tenant?.name }}</h1>
</template>
```

## 4. Custom domain verification

When a tenant adds their own domain, verify the CNAME before activating it:

```ts
// server/api/domains/verify.post.ts
export default defineEventHandler(async (event) => {
    const { domain } = await readBody(event)

    // CNAME method
    const verified = await verifyCustomDomain(domain, {
        method: 'cname',
        expectedTarget: 'cname.yoursaas.com',
    })

    // TXT record method
    // const verified = await verifyCustomDomain(domain, {
    //   method: 'txt-record',
    //   expectedTxt: 'yoursaas-verify=abc123',
    // })

    if (verified) {
        await db.update(tenants).set({ customDomain: domain }).where(...)
        await invalidateTenantCache(domain)
    }

    return { verified }
})
```

## 5. Extend the Tenant type

```ts
// Nuxt 3: types/tenancy.d.ts  |  Nuxt 4: app/types/tenancy.d.ts
import type { Tenant as BaseTenant } from 'nuxt-saas-tenancy';

declare module 'nuxt-saas-tenancy' {
    interface Tenant extends BaseTenant {
        plan: 'free' | 'pro' | 'enterprise';
        brandColor: string;
        faviconUrl: string;
    }
}
```

---

## Complete example app

A realistic SaaS app where each tenant has a custom brand color, a plan, and their own data — with custom domain support.

### File structure (Nuxt 4)

```
├── app/
│   ├── app.vue
│   ├── layouts/
│   │   └── default.vue          ← tenant branding injected here
│   ├── pages/
│   │   ├── index.vue            ← tenant dashboard
│   │   └── settings/
│   │       └── domain.vue       ← custom domain settings page
│   ├── middleware/
│   │   └── plan-guard.ts        ← feature-flag by plan
│   └── types/
│       └── tenancy.d.ts
├── server/
│   ├── tenancy/
│   │   └── resolve.ts
│   └── api/
│       ├── posts.get.ts
│       └── domains/
│           └── verify.post.ts
└── nuxt.config.ts
```

### 1. Extend the Tenant type

```ts
// app/types/tenancy.d.ts
import type { Tenant as BaseTenant } from 'nuxt-saas-tenancy';

declare module 'nuxt-saas-tenancy' {
    interface Tenant extends BaseTenant {
        plan: 'free' | 'pro' | 'enterprise';
        brandColor: string;
        logoUrl: string | null;
    }
}
```

### 2. Resolver (Drizzle ORM example)

```ts
// server/tenancy/resolve.ts
import { defineTenantResolver } from 'nuxt-saas-tenancy';
import { db } from '~/server/db';
import { tenants } from '~/server/db/schema';
import { or, eq } from 'drizzle-orm';

export default defineTenantResolver(async (key) => {
    // key is a subdomain OR a custom domain — match both
    return await db.query.tenants.findFirst({
        where: or(eq(tenants.domain, key), eq(tenants.customDomain, key)),
        columns: { id: true, name: true, domain: true, customDomain: true, plan: true, brandColor: true, logoUrl: true, active: true },
    }) ?? null;
});
```

### 3. Tenant-branded layout

```vue
<!-- app/layouts/default.vue -->
<script setup lang="ts">
const tenant = useTenant();

// Inject brand color as a CSS variable for the whole app
useHead({
    title: () => tenant.value?.name ?? 'Loading…',
    style: [
        {
            innerHTML: () =>
                tenant.value ? `:root { --brand: ${tenant.value.brandColor}; }` : '',
        },
    ],
});
</script>

<template>
    <div class="app">
        <header class="navbar">
            <img v-if="tenant?.logoUrl" :src="tenant.logoUrl" :alt="tenant?.name" class="logo" />
            <span v-else class="logo-text">{{ tenant?.name }}</span>
            <nav>
                <NuxtLink to="/">Dashboard</NuxtLink>
                <NuxtLink to="/settings/domain">Domain</NuxtLink>
            </nav>
        </header>

        <main>
            <slot />
        </main>
    </div>
</template>
```

### 4. Dashboard page

```vue
<!-- app/pages/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'default' });

const tenant = useTenant();
const { data: posts } = await useFetch('/api/posts');
</script>

<template>
    <div>
        <h1>Welcome, {{ tenant?.name }}</h1>
        <p class="plan-badge">{{ tenant?.plan }} plan</p>

        <ul>
            <li v-for="post in posts" :key="post.id">{{ post.title }}</li>
        </ul>
    </div>
</template>
```

### 5. Plan-gated route middleware

```ts
// app/middleware/plan-guard.ts
export default defineNuxtRouteMiddleware((to) => {
    const tenant = useTenant();

    if (to.path.startsWith('/settings') && tenant.value?.plan === 'free') {
        return navigateTo('/?blocked=plan');
    }
});
```

Apply it to any page:

```vue
<script setup>
definePageMeta({ middleware: 'plan-guard' });
</script>
```

### 6. Tenant-scoped API route

```ts
// server/api/posts.get.ts
export default defineEventHandler(async (event) => {
    const tenant = useTenant(event); // throws 404 if no tenant

    return db.query.posts.findMany({
        where: eq(posts.tenantId, tenant.id),
        orderBy: desc(posts.createdAt),
    });
});
```

### 7. Custom domain settings page + verification

```vue
<!-- app/pages/settings/domain.vue -->
<script setup lang="ts">
definePageMeta({ middleware: 'plan-guard' });

const tenant = useTenant();
const domain = ref(tenant.value?.customDomain ?? '');
const status = ref<'idle' | 'checking' | 'verified' | 'failed'>('idle');
const errorMsg = ref('');

async function verify() {
    if (!domain.value.trim()) return;
    status.value = 'checking';
    errorMsg.value = '';

    try {
        const res = await fetch('/api/domains/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain: domain.value.trim() }),
        });
        const data = (await res.json()) as { verified: boolean };
        status.value = data.verified ? 'verified' : 'failed';
    } catch {
        status.value = 'failed';
        errorMsg.value = 'An error occurred. Please try again.';
    }
}
</script>

<template>
    <div>
        <h2>Custom Domain</h2>
        <p>Point a CNAME from your domain to <code>cname.yoursaas.com</code>, then verify below.</p>

        <input v-model="domain" placeholder="acme.com" />
        <button :disabled="status === 'checking'" @click="verify">
            {{ status === 'checking' ? 'Checking…' : 'Verify DNS' }}
        </button>

        <p v-if="status === 'verified'" class="success">Domain verified!</p>
        <p v-else-if="status === 'failed'" class="error">DNS not found yet. Check your CNAME and try again.</p>
    </div>
</template>
```

```ts
// server/api/domains/verify.post.ts
export default defineEventHandler(async (event) => {
    const tenant = useTenant(event);
    const { domain } = await readBody<{ domain: string }>(event);

    const verified = await verifyCustomDomain(domain, {
        method: 'cname',
        expectedTarget: 'cname.yoursaas.com',
    });

    if (verified) {
        await db.update(tenants)
            .set({ customDomain: domain })
            .where(eq(tenants.id, tenant.id));

        await invalidateTenantCache(domain);
    }

    return { verified };
});
```

---

## Configuration

| Option           | Type                                              | Default                      | Description                               |
| ---------------- | ------------------------------------------------- | ---------------------------- | ----------------------------------------- |
| `resolver`       | `'subdomain' \| 'domain' \| 'header' \| 'custom'` | `'subdomain'`                | How to extract tenant key from request    |
| `headerName`     | `string`                                          | —                            | Header to read when `resolver = 'header'` |
| `resolveTenant`  | `string`                                          | `'~/server/tenancy/resolve'` | Path to your resolver file                |
| `cache.driver`   | `'memory' \| 'redis' \| 'nitro'`                  | `'memory'`                   | Cache backend                             |
| `cache.ttl`      | `number`                                          | `60`                         | Cache TTL in seconds                      |
| `cache.redisUrl` | `string`                                          | `$REDIS_URL`                 | Redis connection URL (redis driver only)  |
| `onNotFound`     | `'throw' \| 'redirect:/path' \| 'null'`           | `'throw'`                    | Behaviour when tenant isn't found         |
| `devtools`       | `boolean`                                         | `true` in dev                | Show tenant info panel in Nuxt DevTools   |

---

## Directory structure

### Nuxt 4

```
├── app/
│   ├── pages/index.vue       ← useTenant() composable here
│   └── types/tenancy.d.ts    ← extend Tenant interface here
├── server/
│   ├── tenancy/resolve.ts    ← defineTenantResolver() here
│   └── api/dashboard.get.ts  ← useTenant(event) here
└── nuxt.config.ts
```

### Nuxt 3

```
├── pages/index.vue
├── types/tenancy.d.ts
├── server/
│   ├── tenancy/resolve.ts
│   └── api/dashboard.get.ts
└── nuxt.config.ts
```

---

## How it works

1. A **Nitro plugin** (auto-injected) hooks into every request
2. It extracts the tenant key from the hostname using your chosen `resolver` strategy
3. It checks the **cache** (memory or Redis) — if hit, attaches to `event.context.tenant` and moves on
4. On cache miss, it calls **your resolver function** with the key
5. The resolved tenant is cached and attached to `event.context.tenant`
6. A **Nuxt plugin** transfers the tenant from SSR context → `useState` so the client never re-fetches

---

## Local development with subdomains

Add to `/etc/hosts`:

```
127.0.0.1  acme.localhost
127.0.0.1  globex.localhost
127.0.0.1  initech.localhost
```

Then visit `http://acme.localhost:3000`, `http://globex.localhost:3000`, or `http://initech.localhost:3000`.

> `initech` is on the **free** plan — visiting `/settings/domain` will be redirected to the dashboard with a plan-upgrade notice.

---

## License

MIT
