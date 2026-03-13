import type { H3Event } from 'h3';
import type { Tenant } from '../../../types';

/**
 * Get the resolved tenant for the current request.
 * Throws if no tenant is attached (e.g. onNotFound = 'null' and tenant wasn't found).
 * @param {import('h3').H3Event} event
 * @returns {import('../../../types').Tenant} The resolved tenant
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
 * @param {import('h3').H3Event} event
 * @returns {import('../../../types').Tenant | null} The resolved tenant, or null if not found
 */
export function useTenantOrNull(event: H3Event): Tenant | null {
    return (event.context.tenant as Tenant) ?? null;
}
