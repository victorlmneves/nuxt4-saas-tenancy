import type { H3Event } from 'h3';
import type { Tenant } from '../../../types';

/**
 * Get the resolved tenant for the current request.
 * Throws if no tenant is attached (e.g. onNotFound = 'null' and tenant wasn't found).
 * @param event
 * @example
 * export default defineEventHandler(async (event) => {
 *   const tenant = useTenant(event)
 *   return db.query.posts.findMany({ where: eq(posts.tenantId, tenant.id) })
 * })
 */
export function useTenant(event: H3Event): Tenant {
    const tenant = event.context.tenant;
    if (!tenant) {
        throw createError({
            statusCode: 404,
            message: '[nuxt-saas-tenancy] No tenant found for this request.',
        });
    }
    return tenant as Tenant;
}

/**
 * Like useTenant but returns null instead of throwing.
 * Useful when onNotFound = 'null'.
 * @param event
 */
export function useTenantOrNull(event: H3Event): Tenant | null {
    return (event.context.tenant as Tenant) ?? null;
}
