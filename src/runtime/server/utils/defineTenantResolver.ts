import type { H3Event } from 'h3';

/**
 * Type-safe wrapper for your tenant resolver function.
 * @template T - The tenant object type
 * @param {(keyOrEvent: string | H3Event) => Promise<T | null | undefined>} fn
 * @returns {(keyOrEvent: string | H3Event) => Promise<T | null | undefined>} The wrapped resolver function with an attached `_resolver` marker.
 * @example
 * Standard resolvers (`subdomain`, `domain`, `header`) receive a `string` key:
 * ```ts
 * export default defineTenantResolver(async (key) => {
 *   return await db.query.tenants.findFirst({ where: eq(tenants.domain, key) })
 * })
 * ```
 * @example
 * Custom resolvers (`resolver: 'custom'`) receive the full `H3Event`:
 * ```ts
 * export default defineTenantResolver(async (event) => {
 *   const host = getHeader(event, 'host') ?? ''
 *   const key = host.split('.')[0]
 *   return await db.query.tenants.findFirst({ where: eq(tenants.domain, key) })
 * })
 * ```
 */
export function defineTenantResolver<T extends object>(fn: (keyOrEvent: string | H3Event) => Promise<T | null | undefined>) {
    // Attach a marker so the Nitro plugin can identify it
    const wrapped = async (keyOrEvent: string | H3Event) => fn(keyOrEvent);
    Object.defineProperty(wrapped, '_resolver', {
        value: wrapped,
        writable: false,
        enumerable: false,
        configurable: false,
    });

    return wrapped;
}
