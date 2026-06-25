// Navigation action executor (WS5).
//
// Navigation actions (navigate / open_record / set_filter / scroll_to /
// highlight) are CLIENT-EXECUTED client tools. The SDK is a PURE EXECUTOR: it
// performs no client-side mutation classification and runs only actions the
// iframe has already approved (the server's `mutating` flag is authoritative,
// gated in the iframe). On success the executor performs the action against the
// snapshot's stable handles and returns the tool result AND a fresh
// post-action snapshot with re-issued handles.
//
// Handle resolution order (the contract from WS4):
//   1. `data-wp-nova-h` attribute → the in-session handle store node.
//   2. Fingerprint fallback (stable selector, then role + accessible name).
//   3. Otherwise throw StaleHandleError → a `stale_handle` error frame so the
//      continuation re-streams with a fresh snapshot and the agent re-targets
//      rather than wedging on a dangling tool_call.

import { capturePageContext, cssEscape, HANDLE_ATTR, resolveHandleNode } from "./snapshot.js";
import type { ClientToolCall, ClientToolResult } from "./types.js";

/** Built-in navigation action names the SDK can execute itself (no host handler). */
export const NAVIGATION_ACTIONS = [
    "refresh_context",
    "navigate",
    "open_record",
    "set_filter",
    "scroll_to",
    "highlight",
] as const;

export type NavigationAction = (typeof NAVIGATION_ACTIONS)[number];

/** True when `name` is a built-in navigation action (vs an integrator tool). */
export function isNavigationAction(name: string): name is NavigationAction {
    return (NAVIGATION_ACTIONS as readonly string[]).includes(name);
}

/**
 * Thrown when a stable element handle cannot be resolved against the live DOM.
 * The bridge maps this to a `CLIENT_TOOL_ERROR(code="stale_handle")` frame so
 * the continuation can re-stream with a fresh snapshot and the agent re-targets
 * rather than wedging on a dangling tool_call.
 */
export class StaleHandleError extends Error {
    readonly code = "stale_handle" as const;
    constructor(handle?: string) {
        super(handle ? `stale element handle: ${handle}` : "stale element handle");
        this.name = "StaleHandleError";
    }
}

/** The fingerprint carried in the snapshot, used when the attribute is gone. */
interface HandleFingerprint {
    selector?: string;
    role?: string;
    name?: string;
}

/**
 * Resolve a handle to a live element: attribute / handle-store first, then the
 * fingerprint fallback (stable selector, then role + accessible name). Throws
 * StaleHandleError when nothing resolves.
 */
function resolveHandle(handle: string, fingerprint?: HandleFingerprint): HTMLElement {
    // 1. The in-session handle store (the node stamped at capture time).
    const stored = resolveHandleNode(handle);
    if (stored) return stored as HTMLElement;

    // 1b. A live element still carrying the stamped attribute (handle survived
    // a benign re-render that kept the attribute).
    const byAttr = document.querySelector(`[${HANDLE_ATTR}="${cssEscape(handle)}"]`);
    if (byAttr) return byAttr as HTMLElement;

    // 2. Fingerprint fallback — selector first.
    if (fingerprint?.selector) {
        const bySelector = safeQuery(fingerprint.selector);
        if (bySelector) return bySelector as HTMLElement;
    }
    // 2b. Fingerprint fallback — role + accessible name.
    if (fingerprint?.name) {
        const byName = findByRoleAndName(fingerprint.role, fingerprint.name);
        if (byName) return byName;
    }

    throw new StaleHandleError(handle);
}

/** Guarded querySelector (a malformed stored selector must not throw). */
function safeQuery(selector: string): Element | null {
    try {
        return document.querySelector(selector);
    } catch {
        return null;
    }
}

/**
 * Find the element whose tag/role + accessible name EXACTLY match the
 * fingerprint. Requires an exact name match (no substring) and rejects
 * ambiguity: if zero or more than one element matches, return undefined so
 * resolveHandle throws StaleHandleError rather than acting on the wrong control
 * (e.g. a stale "Save" handle resolving to "Save and exit").
 */
function findByRoleAndName(role: string | undefined, name: string): HTMLElement | undefined {
    const wanted = name.trim().toLowerCase();
    const candidates = document.querySelectorAll("a, button, input, select, textarea, [role]");
    let match: HTMLElement | undefined;
    for (const el of Array.from(candidates)) {
        if (role && !elementMatchesRole(el, role)) {
            continue;
        }
        const text = (el.getAttribute("aria-label") || el.textContent || "").trim().toLowerCase();
        if (text && text === wanted) {
            if (match) return undefined; // Ambiguous: more than one exact match.
            match = el as HTMLElement;
        }
    }
    return match;
}

function elementMatchesRole(el: Element, role: string): boolean {
    const normalizedRole = role.toLowerCase();
    const explicitRole = el.getAttribute("role")?.toLowerCase();
    if (explicitRole === normalizedRole) {
        return true;
    }

    const tag = el.tagName.toLowerCase();
    if (tag === normalizedRole) {
        return true;
    }

    const implicit = implicitRole(el);
    return implicit === normalizedRole;
}

function implicitRole(el: Element): string | undefined {
    const tag = el.tagName.toLowerCase();
    if (tag === "a" && el.getAttribute("href")) return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (type === "search") return "searchbox";
        if (["button", "submit", "reset"].includes(type)) return "button";
        if (type === "checkbox") return "checkbox";
        if (type === "radio") return "radio";
        return "textbox";
    }
    return undefined;
}

/**
 * Resolve an agent-supplied URL against the current document and accept it ONLY
 * when it is http(s) AND same-origin. Returns the resolved absolute URL on
 * success, or null to reject (malformed, non-http(s) scheme such as
 * javascript:/data:/about:, or a cross-origin destination). Relative URLs
 * resolve to the current origin and are allowed.
 */
function resolveSameOriginUrl(url: string): string | null {
    let resolved: URL;
    try {
        resolved = new URL(url, location.href);
    } catch {
        return null;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    if (resolved.origin !== location.origin) return null;
    return resolved.href;
}

/**
 * Move the host app to a same-origin URL without unloading the SDK/iframe bridge.
 * Host routers can either react to the standard popstate event or listen for the
 * explicit `wp-nova:navigate` hook.
 */
function navigateSameDocument(target: string): void {
    history.pushState({}, "", target);

    const popStateEvent =
        typeof PopStateEvent === "function"
            ? new PopStateEvent("popstate", { state: history.state })
            : new Event("popstate");
    window.dispatchEvent(popStateEvent);

    const navigateEvent =
        typeof CustomEvent === "function"
            ? new CustomEvent("wp-nova:navigate", { detail: { url: target } })
            : new Event("wp-nova:navigate");
    window.dispatchEvent(navigateEvent);
}

/**
 * Returns a same-origin href for anchor-like elements. Null means the element is
 * not an anchor or would leave the origin, so the caller should keep its existing
 * click behavior.
 */
function sameOriginAnchorHref(el: HTMLElement): string | null {
    if (el.tagName.toLowerCase() !== "a") {
        return null;
    }
    const href = (el as HTMLAnchorElement).href || el.getAttribute("href") || "";
    return href ? resolveSameOriginUrl(href) : null;
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
): Promise<ClientToolResult> {
    const args = call.args ?? {};
    let result: unknown;

    switch (call.name) {
        case "navigate": {
            // Either follow a captured link handle, or click a non-mutating
            // control that switches views. URL navigation is opt-in via `url`.
            if (typeof args.url === "string" && args.url) {
                // Same-origin guard: resolve against the current document and
                // refuse anything that is not http(s) or leaves the origin. This
                // blocks javascript:/data:/about: schemes and forced cross-origin
                // navigation while keeping same-origin relative URLs working.
                const target = resolveSameOriginUrl(args.url);
                if (!target) throw new StaleHandleError(args.url);
                result = { ok: true, navigatedTo: target };
                navigateSameDocument(target);
                break;
            }
            const { handle, fingerprint } = targetHandle(args);
            const el = resolveHandle(handle, fingerprint);
            scrollAndHighlight(el);
            const target = sameOriginAnchorHref(el);
            if (target) {
                navigateSameDocument(target);
                result = { ok: true, navigatedTo: target, clicked: handle };
            } else {
                el.click();
                result = { ok: true, clicked: handle };
            }
            break;
        }
        case "refresh_context": {
            result = { ok: true, refreshed: true, url: location.href };
            break;
        }
        case "open_record": {
            // Open a record by durable URL when available, or by clicking its
            // captured link/row handle.
            if (typeof args.url === "string" && args.url) {
                const target = resolveSameOriginUrl(args.url);
                if (!target) throw new StaleHandleError(args.url);
                navigateSameDocument(target);
                result = { ok: true, navigatedTo: target, openedUrl: target };
                break;
            }
            const { handle, fingerprint } = targetHandle(args);
            const el = resolveHandle(handle, fingerprint);
            scrollAndHighlight(el);
            const target = sameOriginAnchorHref(el);
            if (target) {
                navigateSameDocument(target);
                result = { ok: true, navigatedTo: target, opened: handle };
            } else {
                el.click();
                result = { ok: true, opened: handle };
            }
            break;
        }
        case "set_filter": {
            // Set a non-mutating search/filter input and dispatch input/change
            // so the host's framework reacts. (Mutating submits are blocked
            // upstream by the server `mutating` flag + iframe confirmation.)
            const { handle, fingerprint } = targetHandle(args);
            const el = resolveHandle(handle, fingerprint);
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
    // action (a microtask + a frame covers most synchronous SPA re-renders).
    await nextFrame();
    await nextFrame();
    return { result, snapshot: capturePageContext(safeSelectors) };
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

/** Resolve after one animation frame (or a short timeout when unavailable). */
function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => resolve());
        } else {
            setTimeout(resolve, 16);
        }
    });
}
