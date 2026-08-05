import type { OmittedFieldValue } from "../../protocol/types/index.js";
import {
    FIELD_VALUE_CAP,
    HARD_EXCLUDE_AUTOCOMPLETE,
    HARD_EXCLUDE_INPUT_TYPES,
    IGNORE_ATTR,
    INCLUDE_ATTR,
    SENSITIVE_NAME_RE,
    VALUE_FIELD_TAGS,
} from "./constants.js";

export interface ValueCaptureDecision {
    allowed: boolean;
    omissionReason?: OmittedFieldValue["reason"];
}

export interface ElementRenderState {
    /** The element itself has a rendered box and may be a link/control target. */
    visible: boolean;
    /** Descendants can still render, including through zero-box wrappers. */
    descendantsMayRender: boolean;
    /** Direct text nodes render even when `display: contents` has no own box. */
    rendersOwnText: boolean;
}

// --- Visibility + sensitivity helpers ----------------------------------------

/** True when the element (or an ancestor) is hidden, aria-hidden, or ignored. */
export function isExcludedSubtree(el: Element): boolean {
    let node: Element | null = el;
    while (node) {
        if (node.hasAttribute(IGNORE_ATTR)) return true;
        if (node.getAttribute("aria-hidden") === "true") return true;
        node = node.parentElement;
    }
    return false;
}

/**
 * True when the element participates in rendered layout. Viewport overlap is
 * intentionally irrelevant: page context includes below-fold content and
 * descendants of scroll containers without scrolling the host page.
 */
export function isVisible(el: Element): boolean {
    return elementRenderState(el).visible;
}

/**
 * Read layout/style once and distinguish an invisible element from a subtree
 * that cannot render at all. `display: contents` and ordinary zero-box wrappers
 * have no target box, but their descendants must remain traversable.
 */
export function elementRenderState(el: Element): ElementRenderState {
    const html = el as HTMLElement;
    const style = getComputedStyle(html);
    const hiddenSubtree =
        html.hasAttribute("hidden") || style.display === "none" || style.opacity === "0";
    if (hiddenSubtree) {
        return { visible: false, descendantsMayRender: false, rendersOwnText: false };
    }
    const hasRenderedBox = Boolean(html.getClientRects && html.getClientRects().length > 0);
    const rect = html.getBoundingClientRect();
    const visible =
        style.visibility !== "hidden" &&
        hasRenderedBox &&
        (rect.width !== 0 || rect.height !== 0);
    return {
        visible,
        descendantsMayRender: true,
        rendersOwnText: visible || (style.display === "contents" && style.visibility !== "hidden"),
    };
}

/** Best-effort accessible name (aria-label → labelledby → text → title). */
export function accessibleName(el: Element): string {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel?.trim()) return ariaLabel.trim();
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
        const labels = labelledBy
            .split(/\s+/)
            .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim() || "")
            .filter(Boolean);
        if (labels.length) return labels.join(" ").slice(0, 120);
    }
    const text = el.textContent?.trim();
    if (text) return text.slice(0, 120);
    const title = el.getAttribute("title");
    if (title?.trim()) return title.trim().slice(0, 120);
    return "";
}

/** The label associated with a form field (for/id, wrapping <label>, aria-label). */
export function fieldLabel(el: Element): string {
    const id = el.getAttribute("id");
    if (id) {
        const forLabel = el.ownerDocument.querySelector(`label[for="${cssEscape(id)}"]`);
        if (forLabel?.textContent?.trim()) return forLabel.textContent.trim().slice(0, 120);
    }
    const wrapping = el.closest("label");
    if (wrapping?.textContent?.trim()) return wrapping.textContent.trim().slice(0, 120);
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim().slice(0, 120);
    const placeholder = el.getAttribute("placeholder");
    if (placeholder?.trim()) return placeholder.trim().slice(0, 120);
    return "";
}

/** A field label that avoids descendant text that may be the field value itself. */
export function safeFieldLabel(el: Element): string {
    const id = el.getAttribute("id");
    if (id) {
        const forLabel = el.ownerDocument.querySelector(`label[for="${cssEscape(id)}"]`);
        if (forLabel?.textContent?.trim()) return forLabel.textContent.trim().slice(0, 120);
    }
    const wrapping = el.closest("label");
    const wrappingText = wrapping ? directText(wrapping) : "";
    if (wrappingText) return wrappingText.slice(0, 120);
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim().slice(0, 120);
    const placeholder = el.getAttribute("placeholder");
    if (placeholder?.trim()) return placeholder.trim().slice(0, 120);
    return "";
}

/** A control label that does not fall back to field text/value content. */
export function controlLabel(el: Element): string {
    const isField = isValueField(el);
    const label = isField ? safeFieldLabel(el) : fieldLabel(el);
    if (label) return label;

    if (isField) {
        const title = el.getAttribute("title");
        if (title?.trim()) return title.trim().slice(0, 120);
        const name = el.getAttribute("name");
        if (name?.trim()) return name.trim().slice(0, 120);
        const id = el.getAttribute("id");
        if (id?.trim()) return id.trim().slice(0, 120);
        return "";
    }

    return accessibleName(el);
}

/** Minimal CSS.escape fallback for attribute-selector building. */
export function cssEscape(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
    return value.replace(/["\\\]]/g, "\\$&");
}

/**
 * Decide whether a field's VALUE may be captured. Default-deny: requires an
 * explicit opt-in AND passing every hard-exclude / sensitivity check. Safe
 * selectors (per-surface allowlist) count as opt-in too.
 */
export function getValueCaptureDecision(el: Element, safeSelectors: string[]): ValueCaptureDecision {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();

    // Hard-exclude by input type.
    if (tag === "input" && HARD_EXCLUDE_INPUT_TYPES.has(type)) {
        return { allowed: false, omissionReason: "sensitive" };
    }

    // Hard-exclude by autocomplete (cc-* by prefix, plus the explicit set).
    const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase().trim();
    if (autocomplete.startsWith("cc-") || HARD_EXCLUDE_AUTOCOMPLETE.has(autocomplete)) {
        return { allowed: false, omissionReason: "sensitive" };
    }

    // Hard-exclude by sensitive name / id / placeholder / aria-label.
    if (hasSensitiveDescriptor(el)) return { allowed: false, omissionReason: "sensitive" };

    // Opt-in gate: the element or an ancestor carries data-wp-nova-include, OR
    // the element matches a per-surface safe selector.
    const optedIn =
        el.closest(`[${INCLUDE_ATTR}]`) !== null ||
        safeSelectors.some((selector) => safeMatch(el, selector));
    return optedIn ? { allowed: true } : { allowed: false, omissionReason: "not_opted_in" };
}

export function mayCaptureValue(el: Element, safeSelectors: string[]): boolean {
    return getValueCaptureDecision(el, safeSelectors).allowed;
}

/** Guarded `Element.matches` (a malformed selector must not throw the capture). */
export function safeMatch(el: Element, selector: string): boolean {
    try {
        return el.matches(selector);
    } catch {
        return false;
    }
}

export function hasSensitiveDescriptor(el: Element, extraDescriptors: Array<string | null> = []): boolean {
    const descriptors = [
        el.getAttribute("name"),
        el.getAttribute("id"),
        el.getAttribute("placeholder"),
        el.getAttribute("aria-label"),
        ...extraDescriptors,
    ];
    return descriptors.some((descriptor) =>
        Boolean(descriptor && SENSITIVE_NAME_RE.test(descriptor)),
    );
}

/** Read + cap a field value (already passed `mayCaptureValue`). */
export function readValue(el: Element): string | undefined {
    const html = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const raw =
        html.value !== undefined && html.value !== null
            ? String(html.value)
            : el.getAttribute("contenteditable") !== null
              ? el.textContent || ""
              : "";
    const trimmed = raw.trim();
    return trimmed ? trimmed.slice(0, FIELD_VALUE_CAP) : undefined;
}

export function isValueField(el: Element): boolean {
    return (
        VALUE_FIELD_TAGS.has(el.tagName.toLowerCase()) ||
        el.getAttribute("contenteditable") !== null
    );
}

export function hasFieldValue(el: Element): boolean {
    return readValue(el) !== undefined;
}

export function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

/** Direct text nodes only, so ignored/hidden descendants cannot leak via parent textContent. */
export function directText(el: Element): string {
    const childNodes = (el as Element & { childNodes?: ArrayLike<ChildNode> }).childNodes;
    if (childNodes && childNodes.length > 0) {
        return normalizeText(
            Array.from(childNodes)
                .filter((node) => node.nodeType === 3)
                .map((node) => node.textContent || "")
                .join(" "),
        );
    }

    // Test doubles may not model childNodes; keep the old leaf fallback for them.
    return el.children.length === 0 ? normalizeText(el.textContent || "") : "";
}
