import { HANDLE_ATTR } from "./constants.js";
import { cssEscape } from "./dom.js";

// --- Handle store ------------------------------------------------------------

/**
 * In-session map from a handle id to the live node it was stamped on. A
 * `WeakMap` keyed by id is not useful (ids are strings), so we keep a `Map`
 * scoped to the LAST capture and rebuild it on each new one. Elements keep their
 * stamped id across captures while they remain connected; this keeps a delayed
 * prewarm/fresh capture from making a just-issued handle stale.
 */
let handleStore = new Map<string, Element>();
let handleCounter = 0;

/** Rebuild the live-node index before issuing handles for a new capture. */
export function beginHandleCapture(): void {
    handleStore = new Map<string, Element>();
}

/** Resolve a handle id to the node stamped during the most recent capture. */
export function resolveHandleNode(id: string): Element | undefined {
    const node = handleStore.get(id);
    // The node may have been re-rendered out of the document since capture.
    if (node?.isConnected) return node;
    return undefined;
}

/** Stamp `data-wp-nova-h` on an element and record it for action-time lookup. */
export function stamp(el: Element): string {
    const existing = el.getAttribute(HANDLE_ATTR);
    if (existing) {
        const indexed = handleStore.get(existing);
        if (!indexed || indexed === el) {
            handleStore.set(existing, el);
            return existing;
        }
    }
    const id = `h${++handleCounter}`;
    el.setAttribute(HANDLE_ATTR, id);
    handleStore.set(id, el);
    return id;
}

/**
 * Remove every `data-wp-nova-h` stamp from the host DOM and reset the in-session
 * handle store/counter. Called on element teardown/reset so the SDK's foreign
 * attributes do not accumulate on the host page across its lifetime.
 */
export function clearHandleStamps(): void {
    if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
        for (const el of Array.from(document.querySelectorAll(`[${HANDLE_ATTR}]`))) {
            el.removeAttribute(HANDLE_ATTR);
        }
    }
    handleStore = new Map<string, Element>();
    handleCounter = 0;
}

/** Build a reasonably stable CSS selector used as a fingerprint fallback. */
export function stableSelector(el: Element): string {
    const id = el.getAttribute("id");
    if (id) return `#${cssEscape(id)}`;
    const parts: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && depth < 4 && node.nodeType === 1) {
        let part = node.tagName.toLowerCase();
        const dataTestId = node.getAttribute("data-testid");
        if (dataTestId) {
            part += `[data-testid="${cssEscape(dataTestId)}"]`;
            parts.unshift(part);
            break;
        }
        const parent = node.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter(
                (sib) => sib.tagName === node?.tagName,
            );
            if (siblings.length > 1) {
                part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
            }
        }
        parts.unshift(part);
        node = node.parentElement;
        depth++;
    }
    return parts.join(" > ");
}
