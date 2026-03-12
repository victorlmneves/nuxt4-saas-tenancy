/**
 * Type-safe wrapper for your tenant resolver function.
 * The function receives the tenant key (subdomain, domain, etc.)
 * and should return a tenant object or null.
 * @param fn
 * @example
 * // server/tenancy/resolve.ts
 * import { defineTenantResolver } from '#tenancy'
 *
 * export default defineTenantResolver(async (key) => {
 *   return await db.query.tenants.findFirst({
 *     where: eq(tenants.domain, key)
 *   })
 * })
 */
export function defineTenantResolver<T extends object>(fn: (key: string) => Promise<T | null | undefined>) {
    // Attach a marker so the Nitro plugin can identify it
    const wrapped = async (key: string) => fn(key);
    (wrapped as any)._resolver = wrapped;
    return wrapped;
}
