import { describe, it, expect } from 'vitest';
import { createError } from 'h3';
import { useTenant, useTenantOrNull } from '../../src/runtime/server/utils/useTenant';
import type { H3Event } from 'h3';
import type { Tenant } from '../../src/types';

const FAKE_TENANT: Tenant = { id: '1', name: 'Acme' } as Tenant;

function makeEvent(tenant: Tenant | null | undefined): H3Event {
    return { context: { tenant } } as unknown as H3Event;
}

describe('useTenant', () => {
    it('returns the tenant when present in event.context', () => {
        const event = makeEvent(FAKE_TENANT);

        expect(useTenant(event)).toBe(FAKE_TENANT);
    });

    it('throws a 404 H3Error when tenant is null', () => {
        const event = makeEvent(null);

        expect(() => useTenant(event)).toThrow();

        try {
            useTenant(event);
        } catch (err: unknown) {
            expect((err as ReturnType<typeof createError>).statusCode).toBe(404);
        }
    });

    it('throws when tenant is undefined', () => {
        const event = makeEvent(undefined);

        expect(() => useTenant(event)).toThrow();
    });
});

describe('useTenantOrNull', () => {
    it('returns the tenant when present', () => {
        const event = makeEvent(FAKE_TENANT);

        expect(useTenantOrNull(event)).toBe(FAKE_TENANT);
    });

    it('returns null when tenant is null', () => {
        const event = makeEvent(null);

        expect(useTenantOrNull(event)).toBeNull();
    });

    it('returns null when tenant is undefined', () => {
        const event = makeEvent(undefined);

        expect(useTenantOrNull(event)).toBeNull();
    });
});
