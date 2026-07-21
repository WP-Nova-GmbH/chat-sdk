// Post-action DOM settle.
//
// After a navigation action or a host tool handler runs, the page usually keeps
// mutating for a while (router transition, lazy route chunk, data fetch). The
// pre-settle snapshot then lags the action — url updated, DOM still the old
// view — and the agent misreads the page. `settleDom` waits for a mutation-quiet
// window before the post-action capture, bounded by a hard cap so a page that
// never goes quiet (tickers, animations) cannot stall the tool round-trip.

import type { PageContext } from "../protocol/types/index.js";
import { capturePageContext } from "./snapshot/index.js";

/** Tuning for the post-action DOM settle. Host-configurable via `SdkConfig.settle`. */
export interface SettleOptions {
    /** Mutation-free window (ms) that counts as settled. */
    quietMs: number;
    /** Hard cap (ms) on the wait; hitting it flags the captured snapshot `unsettled`. */
    maxWaitMs: number;
    /** For host-router navigation, wait for `wp-nova:settled` instead of DOM quiet. */
    waitForNavigationSignal?: boolean;
}

export const DEFAULT_SETTLE: SettleOptions = {
    quietMs: 200,
    maxWaitMs: 1600,
    waitForNavigationSignal: false,
};

/**
 * Window event a host page may dispatch to end the settle wait immediately:
 * `window.dispatchEvent(new CustomEvent("wp-nova:settled"))` once the view
 * triggered by the last action has rendered its data. The SDK listens ONLY
 * while a post-action settle wait is pending. Events dispatched outside a
 * pending wait are ignored. Normal settle mode still falls back to the DOM
 * quiet window; explicit host-signal mode falls back to the hard cap and marks
 * the resulting snapshot unsettled. `detail` is reserved for future use.
 */
export const SETTLED_EVENT = "wp-nova:settled";

export interface SettleResult {
    /** False when the cap was hit: the page was still mutating at capture time. */
    settled: boolean;
}

/** Resolve after one animation frame (or a short timeout when unavailable). */
export function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 16);
        }
    });
}

/**
 * Wait for the DOM to go mutation-quiet, or only for the host readiness event
 * when `requireHostSignal` is true. Resolves on the first applicable condition:
 * quiet window elapsed (settled), `wp-nova:settled` received (settled), cap hit
 * (unsettled), or abort (the round-trip was already discarded; don't linger).
 * Falls back to a two-frame wait — the pre-observer behavior — when
 * MutationObserver or the document is unavailable.
 */
export function settleDom(
    options: SettleOptions,
    signal?: AbortSignal,
    requireHostSignal = false,
): Promise<SettleResult> {
    const hasWindow = typeof window !== "undefined";
    const canObserve =
        typeof MutationObserver === "function" &&
        hasWindow &&
        typeof document !== "undefined" &&
        Boolean(document.documentElement);
    if (!canObserve && !(requireHostSignal && hasWindow)) {
        return nextFrame()
            .then(() => nextFrame())
            .then(() => ({ settled: true }));
    }

    return new Promise((resolve) => {
        let done = false;
        let quietTimer: ReturnType<typeof setTimeout> | undefined;
        let capTimer: ReturnType<typeof setTimeout> | undefined;
        let observer: MutationObserver | undefined;

        const finish = (settled: boolean): void => {
            if (done) return;
            done = true;
            observer?.disconnect();
            clearTimeout(quietTimer);
            clearTimeout(capTimer);
            window.removeEventListener(SETTLED_EVENT, onHostSettled);
            signal?.removeEventListener("abort", onAbort);
            resolve({ settled });
        };

        // Any mutation restarts the quiet window.
        const armQuietTimer = (): void => {
            clearTimeout(quietTimer);
            quietTimer = setTimeout(() => finish(true), options.quietMs);
        };
        const onHostSettled = (): void => finish(true);
        const onAbort = (): void => finish(true);

        capTimer = setTimeout(() => finish(false), options.maxWaitMs);
        if (canObserve) {
            observer = new MutationObserver(() => {
                if (!requireHostSignal) armQuietTimer();
            });
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true,
            });
        }
        window.addEventListener(SETTLED_EVENT, onHostSettled, { once: true });
        signal?.addEventListener("abort", onAbort, { once: true });
        if (!requireHostSignal) armQuietTimer();
    });
}

/**
 * Settle, then capture the post-action page context; a cap-hit wait marks the
 * snapshot `unsettled` so the backend can tell the agent it may lag the action.
 */
export async function captureSettledPageContext(
    safeSelectors: string[],
    options: SettleOptions,
    signal?: AbortSignal,
    requireHostSignal = false,
): Promise<PageContext> {
    const { settled } = await settleDom(options, signal, requireHostSignal);
    const pageContext = capturePageContext(safeSelectors);
    if (!settled && pageContext.snapshot) {
        pageContext.snapshot.unsettled = true;
    }
    return pageContext;
}
