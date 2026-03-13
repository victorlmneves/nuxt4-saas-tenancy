import { describe, it, expect } from 'vitest';
import { defineTenantResolver } from '../../src/runtime/server/utils/defineTenantResolver';

describe('defineTenantResolver', () => {
    it('returns a function', () => {
        const resolver = defineTenantResolver(async () => null);

        expect(typeof resolver).toBe('function');
    });

    it('calls the provided fn with the tenant key', async () => {
        const resolver = defineTenantResolver(async (key) => ({ id: key, name: 'Test' }));
        const result = await resolver('acme');

        expect(result).toEqual({ id: 'acme', name: 'Test' });
    });

    it('returns null when the fn returns null', async () => {
        const resolver = defineTenantResolver(async () => null);

        expect(await resolver('unknown')).toBeNull();
    });

    it('returns undefined when the fn returns undefined', async () => {
        const resolver = defineTenantResolver(async () => undefined);

        expect(await resolver('unknown')).toBeUndefined();
    });

    it('attaches a non-enumerable _resolver marker', () => {
        const resolver = defineTenantResolver(async () => null);

        // @ts-expect-error accessing private marker
        expect(resolver._resolver).toBe(resolver);
        expect(Object.keys(resolver)).not.toContain('_resolver');
    });

    it('propagates errors thrown by the fn', async () => {
        const resolver = defineTenantResolver(async () => {
            throw new Error('DB connection failed');
        });

        await expect(resolver('acme')).rejects.toThrow('DB connection failed');
    });
});
