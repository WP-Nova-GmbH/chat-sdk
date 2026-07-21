/**
 * Resolve an agent-supplied URL against the current document and accept it ONLY
 * when it is http(s) AND same-origin. Returns the resolved absolute URL on
 * success, or null to reject (malformed, non-http(s) scheme such as
 * javascript:/data:/about:, or a cross-origin destination). Relative URLs
 * resolve to the current origin and are allowed.
 */
export function resolveSameOriginUrl(url: string): string | null {
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

export type NavigationMode = "host" | "document";

/**
 * Move the host app to a same-origin URL. SPA routers can intercept the
 * cancelable `wp-nova:navigate` event and call preventDefault() after handling
 * the route; otherwise the SDK falls back to normal document navigation.
 */
export function navigateSameDocument(target: string): { mode: NavigationMode } {
    const navigateEvent =
        typeof CustomEvent === "function"
            ? new CustomEvent("wp-nova:navigate", {
                  cancelable: true,
                  detail: { url: target },
              })
            : new Event("wp-nova:navigate", { cancelable: true });
    const notCanceled = window.dispatchEvent(navigateEvent);
    if (!notCanceled || navigateEvent.defaultPrevented) {
        return { mode: "host" };
    }

    if (typeof location.assign === "function") {
        location.assign(target);
    } else {
        location.href = target;
    }
    return { mode: "document" };
}

/**
 * Tri-state classification of an action target:
 *   - `none`        — not an anchor (or an anchor with no href); a genuine
 *                     control the caller should click natively.
 *   - `same-origin` — a same-origin anchor the caller navigates in-document.
 *   - `cross-origin`— an anchor that would leave the origin; the caller MUST
 *                     block it rather than perform a real top-level navigation.
 */
export type AnchorTarget =
    | { kind: "none" }
    | { kind: "same-origin"; href: string }
    | { kind: "cross-origin" };

export function classifyAnchor(el: HTMLElement): AnchorTarget {
    if (el.tagName.toLowerCase() !== "a") {
        return { kind: "none" };
    }
    const href = (el as HTMLAnchorElement).href || el.getAttribute("href") || "";
    if (!href) {
        return { kind: "none" };
    }
    const sameOrigin = resolveSameOriginUrl(href);
    return sameOrigin ? { kind: "same-origin", href: sameOrigin } : { kind: "cross-origin" };
}

/**
 * Thrown when an action targets a cross-origin anchor. The same-origin guard the
 * explicit-`url` path enforces must also cover captured anchor handles, so the
 * SDK never drives the host page off-origin via a click. Mapped by the bridge to
 * a `CLIENT_TOOL_ERROR(code="handler_threw")` frame.
 */
export class BlockedNavigationError extends Error {
    readonly code = "handler_threw" as const;
    constructor(target?: string) {
        super(
            target
                ? `blocked cross-origin navigation to ${target}`
                : "blocked cross-origin navigation",
        );
        this.name = "BlockedNavigationError";
    }
}
