import { defineEventHandler, type EventHandler, type H3Event } from 'h3';
import { useTenant } from './useTenant';
import type { Tenant } from '../../../types';

/**
 * Convenience wrapper around `defineEventHandler` that resolves the current
 * tenant and passes it as the second argument to your handler.
 * The tenant is guaranteed to be non-null inside the handler — if no tenant
 * could be resolved the module's `onNotFound` behaviour runs first, so your
 * handler is never called with a null tenant.
 * @template T - The tenant type, defaults to the base Tenant
 * @param {(event: H3Event, tenant: T) => ReturnType<EventHandler>} handler - The event handler function
 * @returns {EventHandler} A wrapped event handler with tenant resolution
 * @example
 * export default defineTenantEventHandler(async (event, tenant) => {
 *   return db.query.posts.findMany({ where: eq(posts.tenantId, tenant.id) })
 * })
 */
export function defineTenantEventHandler<T extends Tenant = Tenant>(handler: (event: H3Event, tenant: T) => ReturnType<EventHandler>) {
    return defineEventHandler(async (event: H3Event) => {
        const tenant = useTenant(event) as T;

        return handler(event, tenant);
    });
}
