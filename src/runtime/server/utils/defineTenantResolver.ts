/**
 * Type-safe wrapper for your tenant resolver function.
 * The function receives the tenant key (subdomain, domain, etc.)
 * and should return a tenant object or null.
 * @template T - The tenant object type
 * @param {(key: string) => Promise<T | null | undefined>} fn - The resolver function
 * @returns {(key: string) => Promise<T | null | undefined>} The wrapped resolver function, marked with a `_resolver` symbol for the Nitro plugin to identify it.
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
    Object.defineProperty(wrapped, '_resolver', {
        value: wrapped,
        writable: false,
        enumerable: false,
        configurable: false,
    });

    return wrapped;
}
