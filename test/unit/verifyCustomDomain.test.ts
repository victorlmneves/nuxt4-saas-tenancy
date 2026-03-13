import { describe, it, expect, vi, beforeEach } from 'vitest';
import dns from 'node:dns/promises';
import { verifyCustomDomain } from '../../src/runtime/server/utils/verifyCustomDomain';

vi.mock('node:dns/promises');

const mockDns = vi.mocked(dns);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('verifyCustomDomain — CNAME method', () => {
    it('returns true when the CNAME matches expectedTarget', async () => {
        mockDns.resolveCname.mockResolvedValue(['cname.yoursaas.com']);
        const result = await verifyCustomDomain('acme.com', {
            method: 'cname',
            expectedTarget: 'cname.yoursaas.com',
        });

        expect(result).toBe(true);
        expect(mockDns.resolveCname).toHaveBeenCalledWith('acme.com');
    });

    it('is case-insensitive when comparing CNAME targets', async () => {
        mockDns.resolveCname.mockResolvedValue(['CNAME.YOURSAAS.COM']);
        const result = await verifyCustomDomain('acme.com', {
            method: 'cname',
            expectedTarget: 'cname.yoursaas.com',
        });

        expect(result).toBe(true);
    });

    it('strips trailing dot from DNS response before comparing', async () => {
        mockDns.resolveCname.mockResolvedValue(['cname.yoursaas.com.']);
        const result = await verifyCustomDomain('acme.com', {
            method: 'cname',
            expectedTarget: 'cname.yoursaas.com',
        });

        expect(result).toBe(true);
    });

    it('returns false when the CNAME does not match', async () => {
        mockDns.resolveCname.mockResolvedValue(['other.host.com']);
        const result = await verifyCustomDomain('acme.com', {
            method: 'cname',
            expectedTarget: 'cname.yoursaas.com',
        });

        expect(result).toBe(false);
    });

    it('returns false on ENOTFOUND', async () => {
        const err = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
        mockDns.resolveCname.mockRejectedValue(err);

        expect(await verifyCustomDomain('unknown.com', { method: 'cname', expectedTarget: 'x' })).toBe(false);
    });

    it('returns false on ENODATA', async () => {
        const err = Object.assign(new Error('ENODATA'), { code: 'ENODATA' });
        mockDns.resolveCname.mockRejectedValue(err);

        expect(await verifyCustomDomain('unknown.com', { method: 'cname', expectedTarget: 'x' })).toBe(false);
    });

    it('returns false on ESERVFAIL', async () => {
        const err = Object.assign(new Error('ESERVFAIL'), { code: 'ESERVFAIL' });
        mockDns.resolveCname.mockRejectedValue(err);

        expect(await verifyCustomDomain('unknown.com', { method: 'cname', expectedTarget: 'x' })).toBe(false);
    });

    it('rethrows unexpected errors', async () => {
        mockDns.resolveCname.mockRejectedValue(new Error('network failure'));

        await expect(
            verifyCustomDomain('acme.com', { method: 'cname', expectedTarget: 'x' }),
        ).rejects.toThrow('network failure');
    });

    it('throws when expectedTarget is missing', async () => {
        await expect(verifyCustomDomain('acme.com', { method: 'cname' })).rejects.toThrow(
            'expectedTarget is required',
        );
    });
});

describe('verifyCustomDomain — TXT method', () => {
    it('returns true when a TXT record contains the expected value', async () => {
        mockDns.resolveTxt.mockResolvedValue([['yoursaas-verify=abc123']]);
        const result = await verifyCustomDomain('acme.com', {
            method: 'txt-record',
            expectedTxt: 'yoursaas-verify=abc123',
        });
        expect(result).toBe(true);
    });

    it('returns false when no TXT record matches', async () => {
        mockDns.resolveTxt.mockResolvedValue([['some-other-record']]);
        const result = await verifyCustomDomain('acme.com', {
            method: 'txt-record',
            expectedTxt: 'yoursaas-verify=abc123',
        });
        expect(result).toBe(false);
    });

    it('returns false on ENOTFOUND', async () => {
        const err = Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
        mockDns.resolveTxt.mockRejectedValue(err);
        expect(
            await verifyCustomDomain('unknown.com', { method: 'txt-record', expectedTxt: 'x' }),
        ).toBe(false);
    });

    it('throws when expectedTxt is missing', async () => {
        await expect(verifyCustomDomain('acme.com', { method: 'txt-record' })).rejects.toThrow(
            'expectedTxt is required',
        );
    });
});

describe('verifyCustomDomain — unknown method', () => {
    it('returns false for an unrecognised method', async () => {
        // @ts-expect-error intentionally invalid method
        expect(await verifyCustomDomain('acme.com', { method: 'spf' })).toBe(false);
    });
});
