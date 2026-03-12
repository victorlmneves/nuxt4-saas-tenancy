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
```

Then visit `http://acme.localhost:3000` and `http://globex.localhost:3000`.

---

## License

MIT
