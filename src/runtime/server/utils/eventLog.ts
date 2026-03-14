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

/**
 * Adds a tenant resolution event to the circular log.
 * Events are added in FIFO order, up to a maximum of `MAX_EVENTS`.
 * If the log is full, the oldest event is dropped to make room for the new one.
 * @param {ResolutionEvent} evt - The tenant resolution event to add.
 */
export function addResolutionEvent(evt: ResolutionEvent): void {
    _log.push(evt);

    if (_log.length > MAX_EVENTS) {
        _log.shift();
    }
}


/**
 * Returns a copy of the in-process resolution event log, in reverse chronological order.
 * Each element represents a single tenant resolution event (success, failure, or skipped).
 * The log is circular, so this function will never return more than `MAX_EVENTS` elements.
 * @returns {ResolutionEvent[]} A copy of the resolution event log, in reverse chronological order.
 */
export function getResolutionEvents(): ResolutionEvent[] {
    return _log.slice().reverse();
}

/**
 * Resets the in-process resolution event log to an empty state.
 * Used by the DevTools data endpoint to clear the event log when the
 * "Clear all" button is pressed.
 */
export function clearResolutionEvents(): void {
    _log.length = 0;
}
