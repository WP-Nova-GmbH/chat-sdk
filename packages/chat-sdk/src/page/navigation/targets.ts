import { cssEscape, HANDLE_ATTR, resolveHandleNode } from "../snapshot/index.js";

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
export interface HandleFingerprint {
    selector?: string;
    role?: string;
    name?: string;
}

/**
 * Resolve a handle to a live element: attribute / handle-store first, then the
 * fingerprint fallback (stable selector, then role + accessible name). Throws
 * StaleHandleError when nothing resolves.
 */
export function resolveHandle(handle: string, fingerprint?: HandleFingerprint): HTMLElement {
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
