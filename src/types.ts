/**
 * Base Tenant interface.
 *
 * Extend this in your project to add your own fields:
 * @example
 * // types/tenancy.d.ts
 * import type { Tenant as BaseTenant } from 'nuxt-saas-tenancy'
 *
 * declare module 'nuxt-saas-tenancy' {
 *   interface Tenant extends BaseTenant {
 *     plan: 'free' | 'pro' | 'enterprise'
 *     brandColor: string
 *     faviconUrl: string
 *   }
 * }
 */
export interface Tenant {
    /** Unique tenant identifier */
    id: string;
    /** Human-readable name */
    name: string;
    /** The domain or subdomain key used to resolve this tenant */
    domain: string;
    /** Custom domain if configured (may differ from subdomain) */
    customDomain?: string | null;
    /** Whether this tenant is currently active */
    active?: boolean;
    /** Arbitrary metadata — store plan info, theme, feature flags, etc. */
    meta?: Record<string, unknown>;
}
