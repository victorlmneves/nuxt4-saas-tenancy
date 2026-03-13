# nuxt-saas-tenancy

> Dynamic multi-tenancy for Nuxt. Runtime tenant resolution, smart caching, custom domain verification, and SSR-safe composables — all in one module.

## Who is this for?

This module is aimed at developers building **multi-tenant SaaS applications** with Nuxt — where a single deployed app serves many independent customers, each with their own data, branding, and (optionally) custom domain.

Typical use cases:

- **White-label platforms** — each customer gets their own subdomain (`acme.yoursaas.com`) with a fully branded experience
- **Agency tools / site builders** — one codebase powers dozens of client sites, each at their own domain
- **B2B SaaS** — per-tenant feature flags, plan-gating, and isolated data access
- **Internal tools** — different business units share the same app but see only their own content

If your app is single-tenant (one brand, one customer) you don't need this module.

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
// defineTenantResolver is auto-imported — no import needed
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
    const tenant = event.context.tenant; // typed via H3EventContext augmentation
    if (!tenant) throw createError({ statusCode: 404 });

    return db.query.posts.findMany({
        where: eq(posts.tenantId, tenant.id),
    });
});
```

If you prefer a utility that throws automatically, use the auto-imported `useTenant(event)` (throws 404 when no tenant) or `useTenantOrNull(event)` (returns `null` instead of throwing):

```ts
const tenant = useTenant(event);       // throws createError(404) if null
const tenant = useTenantOrNull(event); // returns Tenant | null
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
        // Auto-uses the cache driver configured in nuxt.config.ts
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
        logoUrl: string | null;
        theme: {
            brand: string;
            brandText: string;
            colorBgPage: string;
            fontSans: string;
            radiusMd: string;
            radiusPill: string;
        };
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

export interface TenantTheme {
    brand: string;        // e.g. '#e74c3c'
    brandText: string;    // text color on brand surfaces
    colorBgPage: string;  // page background
    fontSans: string;     // font stack
    radiusMd: string;     // card/input border-radius
    radiusPill: string;   // badge border-radius
}

declare module 'nuxt-saas-tenancy' {
    interface Tenant extends BaseTenant {
        plan: 'free' | 'pro' | 'enterprise';
        logoUrl: string | null;
        theme: TenantTheme;
    }
}
```

### 2. Resolver (Drizzle ORM example)

```ts
// server/tenancy/resolve.ts
// defineTenantResolver is auto-imported — no import needed
import { db } from '~/server/db';
import { tenants } from '~/server/db/schema';
import { or, eq } from 'drizzle-orm';

export default defineTenantResolver(async (key) => {
    // key is a subdomain OR a custom domain — match both
    return await db.query.tenants.findFirst({
        where: or(eq(tenants.domain, key), eq(tenants.customDomain, key)),
        columns: { id: true, name: true, domain: true, customDomain: true, plan: true, logoUrl: true, theme: true, active: true },
    }) ?? null;
});
```

### 3. Tenant-branded layout

The module serves a per-tenant stylesheet at `/_tenant/[id]/theme.css` that injects all theme tokens as CSS custom properties (`--brand`, `--brand-text`, `--color-bg-page`, etc.). You need to create the route in your project — add this file:

```ts
// server/routes/_tenant/[id]/theme.css.ts
export default defineEventHandler((event) => {
    const tenant = event.context.tenant;
    const requestedId = getRouterParam(event, 'id');

    setHeader(event, 'Content-Type', 'text/css; charset=utf-8');

    if (!tenant || tenant.id !== requestedId) {
        setHeader(event, 'Cache-Control', 'no-store');

        return '';
    }

    setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600');

    const vars = Object.entries(tenant.theme)
        .map(([k, v]) => `  --${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${String(v)};`)
        .join('\n');

    return `:root {\n${vars}\n}\n`;
});
```

Then load it in your layout:

```vue
<!-- app/layouts/default.vue -->
<script setup lang="ts">
const tenant = useTenant();

useHead(() => ({
    title: tenant.value?.name ?? 'Loading…',
    link: tenant.value
        ? [{ key: 'tenant-theme', rel: 'stylesheet', href: `/_tenant/${tenant.value.id}/theme.css` }]
        : [],
}));
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

Then use the CSS variables anywhere in your styles:

```css
.navbar { background: var(--brand); color: var(--brand-text); }
.plan-badge { background: var(--brand); border-radius: var(--radius-pill); }
body { background: var(--color-bg-page); font-family: var(--font-sans); }
```

The stylesheet URL is unique per tenant ID so CDN/browser caching is safe across tenants. The server route sets `Cache-Control: public, max-age=3600`.

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
    const tenant = event.context.tenant; // typed via H3EventContext augmentation
    if (!tenant) {
        throw createError({ statusCode: 404 });
    }

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
    if (!domain.value.trim()) {
        return;
    }

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

        // Auto-uses the cache driver configured in nuxt.config.ts
        await invalidateTenantCache(domain);
    }

    return { verified };
});
```

---

## Configuration

| Option           | Type                                              | Default                                 | Description                                          |
| ---------------- | ------------------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| `resolver`       | `'subdomain' \| 'domain' \| 'header' \| 'custom'` | `'subdomain'`                           | How to extract tenant key from request               |
| `headerName`     | `string`                                          | `'x-tenant-id'`                         | Header to read when `resolver = 'header'`            |
| `resolveTenant`  | `string`                                          | `'~/server/tenancy/resolve'`            | Path to your resolver file                           |
| `cache.driver`   | `'memory' \| 'redis' \| 'nitro'`                  | `'memory'`                              | Cache backend                                        |
| `cache.ttl`      | `number`                                          | `60`                                    | Cache TTL in seconds                                 |
| `cache.redisUrl` | `string`                                          | `$REDIS_URL` / `redis://localhost:6379` | Redis connection URL (redis driver only)             |
| `onNotFound`     | `'throw' \| 'redirect:/path' \| 'null'`           | `'throw'`                               | Behaviour when tenant isn't found                    |
| `skipPaths`      | `string[]`                                        | `[]`                                    | Path prefixes that bypass tenant resolution          |
| `devtools`       | `boolean`                                         | `true` in dev                           | Show tenant info panel in Nuxt DevTools              |

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
6. The `useTenant()` composable uses `useState` with a server-side initializer that reads `event.context.tenant` from the SSR context — no separate plugin needed, and the client never re-fetches

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
