import { describe, it, expect, vi } from 'vitest';

// Mock h3 before importing the util
const mockDefineEventHandler = vi.hoisted(() => vi.fn((fn: unknown) => fn));
const mockCreateError = vi.hoisted(() => vi.fn((opts: { statusCode: number; message: string }) => ({ ...opts })));

vi.mock('h3', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return { ...actual, defineEventHandler: mockDefineEventHandler, createError: mockCreateError };
});

// Mock useTenant from the same package
const mockUseTenant = vi.hoisted(() => vi.fn());

vi.mock('../../src/runtime/server/utils/useTenant', () => ({
    useTenant: mockUseTenant,
}));

import { defineTenantEventHandler } from '../../src/runtime/server/utils/defineTenantEventHandler';

function makeEvent(path = '/') {
    return { path, context: {} };
}

describe('defineTenantEventHandler', () => {
    it('wraps the handler in defineEventHandler', () => {
        defineTenantEventHandler(async () => 'ok');

        expect(mockDefineEventHandler).toHaveBeenCalledOnce();
    });

    it('calls useTenant and passes the result to the handler', async () => {
        const tenant = { id: '1', name: 'Acme', domain: 'acme' };
        mockUseTenant.mockReturnValue(tenant);

        const handlerFn = vi.fn(async () => ({ ok: true }));
        const wrapped = defineTenantEventHandler(handlerFn);
        const event = makeEvent();

        // mockDefineEventHandler returns the inner fn directly
        await (wrapped as unknown as (e: typeof event) => Promise<void>)(event);

        expect(mockUseTenant).toHaveBeenCalledWith(event);
        expect(handlerFn).toHaveBeenCalledWith(event, tenant);
    });

    it('returns the value from the inner handler', async () => {
        const tenant = { id: '1', name: 'Acme', domain: 'acme' };
        mockUseTenant.mockReturnValue(tenant);

        const wrapped = defineTenantEventHandler(async () => 42);
        const result = await (wrapped as unknown as (e: ReturnType<typeof makeEvent>) => Promise<number>)(makeEvent());

        expect(result).toBe(42);
    });

    it('propagates errors thrown by useTenant (e.g. no tenant found)', async () => {
        const err = Object.assign(new Error('No tenant'), { statusCode: 404 });
        mockUseTenant.mockImplementation(() => {
            throw err;
        });

        const wrapped = defineTenantEventHandler(async () => 'never');
        await expect((wrapped as unknown as (e: ReturnType<typeof makeEvent>) => Promise<string>)(makeEvent())).rejects.toThrow(
            'No tenant'
        );
    });
});
