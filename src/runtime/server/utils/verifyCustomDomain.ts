import dns from 'node:dns/promises';

interface VerifyOptions {
    /** Verification method */
    method: 'cname' | 'txt-record';
    /** For CNAME: the expected CNAME target (e.g. 'cname.yoursaas.com') */
    expectedTarget?: string;
    /** For TXT: the expected TXT record value (e.g. 'yoursaas-verify=abc123') */
    expectedTxt?: string;
    /**
     * Maximum milliseconds to wait for the DNS lookup before rejecting.
     * @default 5000
     */
    timeout?: number;
}

/**
 * Verify that a custom domain has been correctly configured by the tenant.
 *
 * CNAME method: checks that `domain` has a CNAME pointing to `expectedTarget`.
 * TXT method: checks that `domain` has a TXT record matching `expectedTxt`.
 * @param {string} domain
 * @param {VerifyOptions} opts
 * @returns {Promise<boolean>} `true` if the DNS record matches, `false` otherwise
 * @example
 * const verified = await verifyCustomDomain('acme.com', {
 *   method: 'cname',
 *   expectedTarget: 'cname.yoursaas.com'
 * })
 */
export async function verifyCustomDomain(domain: string, opts: VerifyOptions): Promise<boolean> {
    const timeoutMs = opts.timeout ?? 5000;

    try {
        if (opts.method === 'cname') {
            if (!opts.expectedTarget) {
                throw new Error('expectedTarget is required for CNAME verification');
            }

            const addresses = await withTimeout(dns.resolveCname(domain), timeoutMs);

            return addresses.some((addr) => addr.toLowerCase().replace(/\.$/, '') === opts.expectedTarget!.toLowerCase());
        }

        if (opts.method === 'txt-record') {
            if (!opts.expectedTxt) {
                throw new Error('expectedTxt is required for TXT verification');
            }

            const records = await withTimeout(dns.resolveTxt(domain), timeoutMs);
            const flat = records.flat().join('');

            return flat.includes(opts.expectedTxt);
        }

        return false;
    } catch (err) {
        // DNS errors (ENOTFOUND, ENODATA) mean verification failed, not a crash
        if (
            err instanceof Error &&
            'code' in err &&
            ['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ETIMEOUT'].includes((err as NodeJS.ErrnoException).code ?? '')
        ) {
            return false;
        }

        throw err;
    }
}

/**
 * Race a promise against a timeout, rejecting with an ETIMEOUT-coded error if exceeded.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>} The resolved value of the promise, or rejects if the timeout is exceeded.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(Object.assign(new Error(`DNS lookup timed out after ${ms}ms`), { code: 'ETIMEOUT' })), ms)
        ),
    ]);
}
