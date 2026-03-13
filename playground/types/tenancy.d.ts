import type { Tenant as BaseTenant } from '../src/types';

declare module 'nuxt-saas-tenancy' {
    interface Tenant extends BaseTenant {
        plan: 'free' | 'pro' | 'enterprise';
        brandColor: string;
    }
}

export {};
