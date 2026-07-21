/** Re-mint proactively at this fraction of the token's `expires_in`. */
const REFRESH_AT_FRACTION = 0.8;
/** Floor for the proactive re-mint timer so a tiny TTL doesn't tight-loop. */
const MIN_REFRESH_MS = 5_000;
/** Retry cadence after tokenEndpoint transport failures. */
const TOKEN_ERROR_RETRY_MS = 30_000;

/** Owns token refresh and transport-retry scheduling for one chat element. */
export class TokenTimers {
    private refreshTimer?: ReturnType<typeof setTimeout>;
    private errorRetryTimer?: ReturnType<typeof setTimeout>;

    armRefresh(expiresInSec: number, refresh: () => void): void {
        this.clearRefresh();
        this.clearErrorRetry();
        if (!(expiresInSec > 0)) return;
        const delay = Math.max(
            MIN_REFRESH_MS,
            Math.floor(expiresInSec * 1000 * REFRESH_AT_FRACTION),
        );
        this.refreshTimer = setTimeout(refresh, delay);
    }

    armErrorRetry(retry: () => void): void {
        this.clearErrorRetry();
        this.errorRetryTimer = setTimeout(() => {
            this.errorRetryTimer = undefined;
            retry();
        }, TOKEN_ERROR_RETRY_MS);
    }

    clearRefresh(): void {
        if (!this.refreshTimer) return;
        clearTimeout(this.refreshTimer);
        this.refreshTimer = undefined;
    }

    clearErrorRetry(): void {
        if (!this.errorRetryTimer) return;
        clearTimeout(this.errorRetryTimer);
        this.errorRetryTimer = undefined;
    }

    clear(): void {
        this.clearRefresh();
        this.clearErrorRetry();
    }
}
