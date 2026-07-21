import type { ClientToolCall, ClientToolResult } from "../../protocol/types/index.js";
import { captureSettledPageContext, DEFAULT_SETTLE, type SettleOptions } from "../settle.js";
import { type HandleFingerprint, resolveHandle, StaleHandleError } from "./targets.js";
import {
    BlockedNavigationError,
    classifyAnchor,
    type NavigationMode,
    navigateSameDocument,
    resolveSameOriginUrl,
} from "./urls.js";

/**
 * Thrown when a navigation action is asked to run after its round-trip was
 * aborted (the bridge timed out). Mapped to a `timeout` error frame; in practice
 * the result is discarded because the bridge already rejected.
 */
class AbortedActionError extends Error {
    readonly code = "timeout" as const;
    constructor() {
        super("navigation action aborted before execution");
        this.name = "AbortedActionError";
    }
}

/** Refuse to perform a mutating action once the round-trip has been aborted. */
function assertNotAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new AbortedActionError();
}

/**
 * Resolve a handle, scroll/highlight it, then either navigate in-document
 * (same-origin anchor), block (cross-origin anchor), or click natively (genuine
 * control). `verbKey` is the result field naming the acted-on handle.
 */
function clickOrNavigate(
    el: HTMLElement,
    handle: string,
    verbKey: "clicked" | "opened",
    signal?: AbortSignal,
): Record<string, unknown> {
    scrollAndHighlight(el);
    const anchor = classifyAnchor(el);
    if (anchor.kind === "cross-origin") {
        throw new BlockedNavigationError();
    }
    if (anchor.kind === "same-origin") {
        assertNotAborted(signal);
        const navigation = navigateSameDocument(anchor.href);
        return {
            ok: true,
            navigatedTo: anchor.href,
            [verbKey]: handle,
            navigation: navigation.mode,
        };
    }
    assertNotAborted(signal);
    el.click();
    return { ok: true, [verbKey]: handle };
}

/**
 * The `url`-arg shortcut shared by navigate / open_record: resolve + same-origin
 * guard the agent-supplied URL and navigate in-document. Returns null when no
 * `url` arg was supplied (the caller falls back to a handle).
 */
function urlShortcut(
    args: Record<string, unknown>,
    signal?: AbortSignal,
): { target: string; navigation: NavigationMode } | null {
    if (typeof args.url !== "string" || !args.url) return null;
    const target = resolveSameOriginUrl(args.url);
    if (!target) throw new StaleHandleError(args.url);
    assertNotAborted(signal);
    const navigation = navigateSameDocument(target);
    return { target, navigation: navigation.mode };
}

/** Pull the target handle + its fingerprint out of the tool args. */
function targetHandle(args: Record<string, unknown>): {
    handle: string;
    fingerprint?: HandleFingerprint;
} {
    const handle = typeof args.handle === "string" ? args.handle : "";
    if (!handle) throw new StaleHandleError();
    const fingerprint =
        args.fingerprint && typeof args.fingerprint === "object"
            ? (args.fingerprint as HandleFingerprint)
            : undefined;
    return { handle, fingerprint };
}

/** Scroll an element into view and briefly outline it so the user can track it. */
function scrollAndHighlight(el: HTMLElement): void {
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    const previous = el.style.outline;
    el.style.outline = "3px solid #4f8cff";
    setTimeout(() => {
        el.style.outline = previous;
    }, 1500);
}

/**
 * Execute a built-in navigation action in the host page and return its result
 * plus a fresh snapshot with re-issued handles. The SDK runs only what the
 * iframe has already approved; it performs no mutation classification here.
 */
export async function executeNavigation(
    call: ClientToolCall,
    safeSelectors: string[] = [],
    signal?: AbortSignal,
    settle: SettleOptions = DEFAULT_SETTLE,
): Promise<ClientToolResult> {
    const args = call.args ?? {};
    // The round-trip may already have been aborted (timeout) before this runs;
    // never perform a side effect for a discarded request.
    assertNotAborted(signal);
    let result: unknown;

    switch (call.name) {
        case "navigate": {
            // Either follow a captured link handle, or click a non-mutating
            // control that switches views. URL navigation is opt-in via `url`.
            // The same-origin guard blocks javascript:/data:/about: schemes and
            // forced cross-origin navigation while keeping relative URLs working.
            const shortcut = urlShortcut(args, signal);
            if (shortcut) {
                result = {
                    ok: true,
                    navigatedTo: shortcut.target,
                    navigation: shortcut.navigation,
                };
                break;
            }
            const { handle, fingerprint } = targetHandle(args);
            const el = resolveHandle(handle, fingerprint);
            result = clickOrNavigate(el, handle, "clicked", signal);
            break;
        }
        case "refresh_context": {
            result = { ok: true, refreshed: true, url: location.href };
            break;
        }
        case "click": {
            const { handle, fingerprint } = targetHandle(args);
            const el = resolveHandle(handle, fingerprint);
            result = clickOrNavigate(el, handle, "clicked", signal);
            break;
        }
        case "open_record": {
            // Open a record by durable URL when available, or by clicking its
            // captured link/row handle.
            const shortcut = urlShortcut(args, signal);
            if (shortcut) {
                result = {
                    ok: true,
                    navigatedTo: shortcut.target,
                    openedUrl: shortcut.target,
                    navigation: shortcut.navigation,
                };
                break;
            }
            const { handle, fingerprint } = targetHandle(args);
            const el = resolveHandle(handle, fingerprint);
            result = clickOrNavigate(el, handle, "opened", signal);
            break;
        }
        case "set_filter": {
            // Set a non-mutating search/filter input and dispatch input/change
            // so the host's framework reacts. (Mutating submits are blocked
            // upstream by the server `mutating` flag + iframe confirmation.)
            const { handle, fingerprint } = targetHandle(args);
            const el = resolveHandle(handle, fingerprint);
            assertNotAborted(signal);
            const value = args.value == null ? "" : String(args.value);
            applyInputValue(el, value);
            result = { ok: true, filtered: handle, value };
            break;
        }
        case "scroll_to": {
            const { handle, fingerprint } = targetHandle(args);
            const el = resolveHandle(handle, fingerprint);
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            result = { ok: true, scrolledTo: handle };
            break;
        }
        case "highlight": {
            const { handle, fingerprint } = targetHandle(args);
            const el = resolveHandle(handle, fingerprint);
            scrollAndHighlight(el);
            result = { ok: true, highlighted: handle };
            break;
        }
        default:
            // Should never reach here (the dispatcher only routes known actions).
            throw new StaleHandleError();
    }

    // Let the DOM settle before re-capturing so the fresh snapshot reflects the
    // action. Opted-in host-router navigation waits for the host's explicit
    // readiness signal; other actions use the mutation-quiet window.
    const navigation =
        result && typeof result === "object" && "navigation" in result
            ? (result.navigation as NavigationMode)
            : undefined;
    const requireHostSignal = settle.waitForNavigationSignal === true && navigation === "host";
    return {
        result,
        snapshot: await captureSettledPageContext(safeSelectors, settle, signal, requireHostSignal),
    };
}

/** Set a field's value and fire input/change so reactive frameworks update. */
function applyInputValue(el: HTMLElement, value: string): void {
    const field = el as HTMLInputElement | HTMLTextAreaElement;
    if (field.value !== undefined) {
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.getAttribute("contenteditable") !== null) {
        el.textContent = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }
}
