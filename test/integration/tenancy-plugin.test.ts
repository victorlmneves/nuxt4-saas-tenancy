/**
 * Integration tests for the Nitro tenancy plugin.
 *
 * Strategy: mock nitropack/runtime so that defineNitroPlugin returns the
 * plugin function directly, then call it with a fake nitroApp to register
 * the 'request' hook, and invoke that hook synchronously with mock H3Events.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invalidateTenantCache } from '../../src/runtime/server/utils/cache';

// --- Hoisted mocks (must be created before vi.mock factories run) ------------

const mockGetHeader = vi.hoisted(() => vi.fn<(event: unknown, name: string) => string | undefined>(() => undefined));
const mockSendError = vi.hoisted(() => vi.fn());
const mockSendRedirect = vi.hoisted(() => vi.fn());
const mockCreateError = vi.hoisted(() =>
    vi.fn((opts: { statusCode: number; message: string }) => ({ statusCode: opts.statusCode, message: opts.message })),
);
const mockResolver = vi.hoisted(() => vi.fn<(key: string) => Promise<object | null>>());
const mockUseRuntimeConfig = vi.hoisted(() => vi.fn());

// --- Module mocks ------------------------------------------------------------

vi.mock('#tenant-resolver', () => ({ default: { _resolver: mockResolver } }));

vi.mock('nitropack/runtime', () => ({
    // Return the plugin fn directly so we can call it in tests
    defineNitroPlugin: (fn: unknown) => fn,
    useRuntimeConfig: mockUseRuntimeConfig,
}));

vi.mock('h3', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>;
    return { ...actual, getHeader: mockGetHeader, sendError: mockSendError, sendRedirect: mockSendRedirect, createError: mockCreateError };
});

// --- Imports (run after mocks) -----------------------------------------------

import plugin from '../../src/runtime/server/plugins/tenancy';

// --- Helpers -----------------------------------------------------------------

const DEFAULT_CONFIG = {
    resolver: 'subdomain' as const,
    headerName: 'x-tenant-id',
    onNotFound: 'throw' as 'throw' | 'null' | `redirect:${string}`,
    cache: { driver: 'memory' as const, ttl: 60 },
};

type Config = typeof DEFAULT_CONFIG;

function makeEvent(path = '/dashboard') {
    return { path, context: {} } as { path: string; context: Record<string, unknown> };
}

/**
 * Boot the plugin with a given config and return the registered 'request' hook callback.
 * @param {Partial<Config>} config - Partial configuration to override defaults
 * @returns {(event: ReturnType<typeof makeEvent>) => Promise<void>} The registered request hook callback
 */
function buildHook(config: Partial<Config> = {}) {
    mockUseRuntimeConfig.mockReturnValue({ _tenancy: { ...DEFAULT_CONFIG, ...config } });
    const nitroApp = { hooks: { hook: vi.fn() } };
    (plugin as unknown as (app: typeof nitroApp) => void)(nitroApp);
    return nitroApp.hooks.hook.mock.calls[0]![1] as (event: ReturnType<typeof makeEvent>) => Promise<void>;
}

// --- Tests -------------------------------------------------------------------

beforeEach(async () => {
    vi.clearAllMocks();
    await invalidateTenantCache('acme');
    await invalidateTenantCache('globex');
});

describe('static asset skip', () => {
    it.each(['/_nuxt/chunk.js', '/__nuxt_error', '/favicon.ico'])(
        'skips resolution for "%s"',
        async (path) => {
            const hook = buildHook();
            const event = makeEvent(path);
            mockGetHeader.mockReturnValue('acme.localhost');
            await hook(event);

            // Resolver should never be called for internal paths
            expect(mockResolver).not.toHaveBeenCalled();
            expect(event.context.tenant).toBeUndefined();
        },
    );
});

describe('redirect-target skip (infinite loop guard)', () => {
    it('skips resolution for the onNotFound redirect path itself', async () => {
        const hook = buildHook({ onNotFound: 'redirect:/no-tenant' });
        const event = makeEvent('/no-tenant');
        mockGetHeader.mockReturnValue('acme.localhost');
        await hook(event);

        expect(mockResolver).not.toHaveBeenCalled();
        expect(event.context.tenant).toBeNull();
    });
});

describe('tenant key extraction — subdomain', () => {
    it('resolves a 2-part host (local dev)', async () => {
        const hook = buildHook();
        const event = makeEvent();
        mockGetHeader.mockReturnValue('acme.localhost');
        mockResolver.mockResolvedValue({ id: '1', name: 'Acme' });
        await hook(event);

        expect(mockResolver).toHaveBeenCalledWith('acme');
        expect(event.context.tenant).toEqual({ id: '1', name: 'Acme' });
    });

    it('resolves a 3-part host (production)', async () => {
        const hook = buildHook();
        const event = makeEvent();
        mockGetHeader.mockReturnValue('globex.yoursaas.com');
        mockResolver.mockResolvedValue({ id: '2', name: 'Globex' });
        await hook(event);

        expect(mockResolver).toHaveBeenCalledWith('globex');
    });

    it('calls handleNotFound for a bare hostname with no subdomain', async () => {
        const hook = buildHook();
        const event = makeEvent();
        mockGetHeader.mockReturnValue('localhost');
        await hook(event);

        expect(mockSendError).toHaveBeenCalled();
        expect(mockCreateError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
});

describe('tenant key extraction — header resolver', () => {
    it('reads the configured header', async () => {
        const hook = buildHook({ resolver: 'header' });
        const event = makeEvent();
        mockGetHeader.mockImplementation((_event, name) => (name === 'x-tenant-id' ? 'acme' : undefined));
        mockResolver.mockResolvedValue({ id: '1', name: 'Acme' });
        await hook(event);

        expect(mockResolver).toHaveBeenCalledWith('acme');
    });
});

describe('cache behaviour', () => {
    it('serves a cached tenant without calling the resolver', async () => {
        const hook = buildHook();
        const event = makeEvent();
        mockGetHeader.mockReturnValue('acme.localhost');
        mockResolver.mockResolvedValue({ id: '1', name: 'Acme' });

        // First request — resolver called, result cached
        await hook(event);

        expect(mockResolver).toHaveBeenCalledTimes(1);

        // Second request — should come from cache
        vi.clearAllMocks();
        mockGetHeader.mockReturnValue('acme.localhost');
        const event2 = makeEvent();
        await hook(event2);

        expect(mockResolver).not.toHaveBeenCalled();
        expect(event2.context.tenant).toEqual({ id: '1', name: 'Acme' });
    });
});

describe('onNotFound strategies', () => {
    it('sends a 404 error when onNotFound = "throw"', async () => {
        const hook = buildHook({ onNotFound: 'throw' });
        const event = makeEvent();
        mockGetHeader.mockReturnValue('unknown.localhost');
        mockResolver.mockResolvedValue(null);
        await hook(event);

        expect(mockSendError).toHaveBeenCalled();
        expect(mockCreateError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    it('redirects when onNotFound = "redirect:/no-tenant"', async () => {
        const hook = buildHook({ onNotFound: 'redirect:/no-tenant' });
        const event = makeEvent();
        mockGetHeader.mockReturnValue('unknown.localhost');
        mockResolver.mockResolvedValue(null);
        await hook(event);

        expect(mockSendRedirect).toHaveBeenCalledWith(expect.anything(), '/no-tenant', 302);
    });

    it('sets event.context.tenant = null when onNotFound = "null"', async () => {
        const hook = buildHook({ onNotFound: 'null' });
        const event = makeEvent();
        mockGetHeader.mockReturnValue('unknown.localhost');
        mockResolver.mockResolvedValue(null);
        await hook(event);

        expect(event.context.tenant).toBeNull();
        expect(mockSendError).not.toHaveBeenCalled();
    });
});

describe('resolver error handling', () => {
    it('sends a 500 error when the resolver throws', async () => {
        const hook = buildHook();
        const event = makeEvent();
        mockGetHeader.mockReturnValue('acme.localhost');
        mockResolver.mockRejectedValue(new Error('DB timeout'));
        await hook(event);

        expect(mockSendError).toHaveBeenCalled();
        expect(mockCreateError).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
    });
});
