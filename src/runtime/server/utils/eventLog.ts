/**
 * In-process circular buffer of recent tenant resolution events.
 * Populated by the Nitro tenancy plugin (dev mode only) and read by the
 * DevTools data endpoint.  Maximum 50 entries; oldest is dropped when full.
 */

export interface ResolutionEvent {
    /** The `Host` header from the incoming request. */
    hostname: string;
    /** Extracted tenant key (subdomain / domain / header value). `null` when no key could be derived. */
    key: string | null;
    /** Resolved tenant identifier — same as `key` on success, `null` on not-found / error. */
    tenant: string | null;
    /** True when the value was served from cache (did not call the resolver). */
    cacheHit: boolean;
    /** True when the path matched `skipPaths` and resolution was intentionally bypassed. */
    skipped: boolean;
    /** Total time from hook start to completion, in milliseconds. */
    durationMs: number;
    /** Unix timestamp (ms) when the event was recorded. */
    timestamp: number;
}

const MAX_EVENTS = 50;
const _log: ResolutionEvent[] = [];

export function addResolutionEvent(evt: ResolutionEvent): void {
    _log.push(evt);

    if (_log.length > MAX_EVENTS) {
        _log.shift();
    }
}

/** Returns a copy of the log, newest-first. */
export function getResolutionEvents(): ResolutionEvent[] {
    return _log.slice().reverse();
}

export function clearResolutionEvents(): void {
    _log.length = 0;
}
