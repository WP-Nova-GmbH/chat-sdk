// Visible Page Snapshot capture (first-party, in the host page) — WS4.
//
// The SDK captures what the user can actually SEE: visible structure/text,
// selected text, visible links, visible interactive controls, and the labels
// of form fields — plus stable element handles the navigation/tool executors
// resolve at action time. It is dependency-free and runs entirely client-side.
//
// FIELD-VALUE POLICY — DEFAULT-DENY (privacy-critical; this is the highest-risk
// PII/secret path into the agent). By default the snapshot OMITS every
// input/textarea/contenteditable value. A value is captured ONLY when it both
//   (a) opts in via `data-wp-nova-include` (attribute on the field or an
//       ancestor) or a per-surface safe-selector allowlist, AND
//   (b) passes every sensitivity check.
// HARD-EXCLUDE regardless of opt-in:
//   - input[type] in {password, hidden, file}
//   - autocomplete in {cc-*, current-password, new-password, one-time-code}
//   - name/id/placeholder/aria-label matching
//     /(card|cc|cvv|cvc|ssn|secret|token|password|account|iban|routing|pin)/
//   - aria-hidden / off-viewport / display:none subtrees / data-wp-nova-ignore
//
// STABLE HANDLES: every captured element is stamped with a `data-wp-nova-h`
// attribute, recorded in an in-session WeakMap(id → node), and given a
// fingerprint (selector + role + accessible name) carried in the snapshot.
// Action-time resolution (navigation.ts) is attribute → WeakMap → fingerprint →
// STALE_HANDLE. Handles are re-indexed on each capture, but a still-live element
// keeps its existing handle id so background captures cannot invalidate handles
// the model just saw.
//
// SIZE BUDGET: enforced client-side BEFORE postMessage. Viewport-visible
// controls/links/labeled fields fill bounded budgets for handle count,
// visible-text chars, and per-field value length; anything dropped flips
// `truncated: true`.
//
// SCOPE: open shadow roots are traversed (composed). Closed shadow roots,
// cross-origin iframes, and canvas/WebGL/SVG-only regions cannot be read and
// flip `partial: true` so the agent knows context is incomplete.

import type {
    ElementHandle,
    PageContext,
    PageStructuredData,
    VisibleControl,
    VisibleLink,
    VisiblePageSnapshot,
} from "./types.js";

// --- Size budget (mirrors the POC's FIELD_VALUE_CAP / MARKDOWN_CAP) ----------

/** Max number of stable handles issued per capture. */
const MAX_HANDLES = 200;
/** Max visible-text characters carried in the snapshot. */
const VISIBLE_TEXT_CAP = 12_000;
/** Per-captured-field value cap (chars). */
const FIELD_VALUE_CAP = 500;
/** Max visible links carried in the snapshot. */
const MAX_LINKS = 100;
/** Max visible controls carried in the snapshot. */
const MAX_CONTROLS = 100;
/** Attribute stamped on captured elements; the handle id. */
export const HANDLE_ATTR = "data-wp-nova-h";
/** Opt-in attribute that allows a field value to be captured (on it or an ancestor). */
const INCLUDE_ATTR = "data-wp-nova-include";
/** Opt-out attribute: the element and its subtree are excluded entirely. */
const IGNORE_ATTR = "data-wp-nova-ignore";

/** Field names / ids / labels that hard-exclude a value regardless of opt-in. */
const SENSITIVE_NAME_RE = /(card|cc|cvv|cvc|ssn|secret|token|password|account|iban|routing|pin)/i;
/** Input types whose values are never captured. */
const HARD_EXCLUDE_INPUT_TYPES = new Set(["password", "hidden", "file"]);
/** autocomplete tokens that hard-exclude a value (cc-* handled by prefix). */
const HARD_EXCLUDE_AUTOCOMPLETE = new Set(["current-password", "new-password", "one-time-code"]);

/** Tags treated as interactive controls. */
const CONTROL_TAGS = new Set(["button", "input", "select", "textarea"]);

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

/** Resolve a handle id to the node stamped during the most recent capture. */
export function resolveHandleNode(id: string): Element | undefined {
    const node = handleStore.get(id);
    // The node may have been re-rendered out of the document since capture.
    if (node?.isConnected) return node;
    return undefined;
}

/** Stamp `data-wp-nova-h` on an element and record it for action-time lookup. */
function stamp(el: Element): string {
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

// --- Visibility + sensitivity helpers ----------------------------------------

/** True when the element (or an ancestor) is hidden, aria-hidden, or ignored. */
function isExcludedSubtree(el: Element): boolean {
    let node: Element | null = el;
    while (node) {
        if (node.hasAttribute(IGNORE_ATTR)) return true;
        if (node.getAttribute("aria-hidden") === "true") return true;
        node = node.parentElement;
    }
    return false;
}

/** True when the element renders with a non-zero box that overlaps the viewport. */
function isVisible(el: Element): boolean {
    const html = el as HTMLElement;
    if (!html.getClientRects || html.getClientRects().length === 0) return false;
    const style = getComputedStyle(html);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
    }
    const rect = html.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return isInViewport(el);
}

/** True when the element's box currently overlaps the viewport. */
function isInViewport(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
}

/** Best-effort accessible name (aria-label → labelledby → text → title). */
function accessibleName(el: Element): string {
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
function fieldLabel(el: Element): string {
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
function mayCaptureValue(el: Element, safeSelectors: string[]): boolean {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();

    // Hard-exclude by input type.
    if (tag === "input" && HARD_EXCLUDE_INPUT_TYPES.has(type)) return false;

    // Hard-exclude by autocomplete (cc-* by prefix, plus the explicit set).
    const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase().trim();
    if (autocomplete.startsWith("cc-") || HARD_EXCLUDE_AUTOCOMPLETE.has(autocomplete)) return false;

    // Hard-exclude by sensitive name / id / placeholder / aria-label.
    if (hasSensitiveDescriptor(el)) return false;

    // Opt-in gate: the element or an ancestor carries data-wp-nova-include, OR
    // the element matches a per-surface safe selector.
    const optedIn =
        el.closest(`[${INCLUDE_ATTR}]`) !== null ||
        safeSelectors.some((selector) => safeMatch(el, selector));
    return optedIn;
}

/** Guarded `Element.matches` (a malformed selector must not throw the capture). */
function safeMatch(el: Element, selector: string): boolean {
    try {
        return el.matches(selector);
    } catch {
        return false;
    }
}

function hasSensitiveDescriptor(el: Element, extraDescriptors: Array<string | null> = []): boolean {
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
function readValue(el: Element): string | undefined {
    const html = el as HTMLInputElement | HTMLTextAreaElement;
    const raw =
        html.value !== undefined && html.value !== null
            ? String(html.value)
            : el.getAttribute("contenteditable") !== null
              ? el.textContent || ""
              : "";
    const trimmed = raw.trim();
    return trimmed ? trimmed.slice(0, FIELD_VALUE_CAP) : undefined;
}

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

/** Direct text nodes only, so ignored/hidden descendants cannot leak via parent textContent. */
function directText(el: Element): string {
    const childNodes = (el as Element & { childNodes?: ArrayLike<ChildNode> }).childNodes;
    if (childNodes) {
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

// --- Traversal ---------------------------------------------------------------

/** A visible candidate element collected during traversal. */
interface Candidate {
    el: Element;
}

/**
 * Walk the composed tree from `root`, descending into OPEN shadow roots, and
 * collect visible links and controls. Sets `sawPartial` when a region cannot be
 * read (closed shadow root / cross-origin iframe / canvas).
 */
function collect(
    root: ParentNode,
    links: Candidate[],
    controls: Candidate[],
    state: { partial: boolean },
): void {
    const children = (root as Element).children ?? (root as Document).children;
    if (!children) return;
    for (const el of Array.from(children)) {
        if (isExcludedSubtree(el)) continue;

        const tag = el.tagName.toLowerCase();

        // Out-of-scope regions: mark partial, do not descend.
        if (tag === "iframe" || tag === "canvas") {
            state.partial = true;
            continue;
        }
        // Closed shadow root: the host element renders but its internals are
        // unreadable. (Open roots expose `.shadowRoot`; closed ones return null.)
        const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;

        if (isVisible(el)) {
            if (tag === "a" && el.getAttribute("href")) {
                links.push({ el });
            } else if (CONTROL_TAGS.has(tag) || el.getAttribute("contenteditable") !== null) {
                controls.push({ el });
            }
        }

        // Descend into the light DOM and any OPEN shadow root.
        collect(el, links, controls, state);
        if (shadow) {
            collect(shadow, links, controls, state);
        }
    }
}

/** Capture visible text the user can read, composed across open shadow roots. */
function captureVisibleText(
    state: { partial: boolean },
    safeSelectors: string[],
): { text: string; truncated: boolean } {
    const parts: string[] = [];
    let budget = VISIBLE_TEXT_CAP;
    let truncated = false;

    const walk = (root: ParentNode): void => {
        const children = (root as Element).children ?? (root as Document).children;
        if (!children) return;
        for (const el of Array.from(children)) {
            if (budget <= 0) {
                truncated = true;
                return;
            }
            if (isExcludedSubtree(el) || !isVisible(el)) continue;
            const tag = el.tagName.toLowerCase();
            if (tag === "script" || tag === "style" || tag === "noscript") continue;
            if (tag === "iframe" || tag === "canvas") {
                state.partial = true;
                continue;
            }
            // Take direct text nodes only (avoids duplicating descendant text
            // and prevents ignored descendants from leaking via parent textContent).
            // Apply the SAME default-deny field-value gate as the controls loop:
            // contenteditable / form field typed text is OMITTED unless opted in.
            const isFieldLike =
                tag === "input" ||
                tag === "textarea" ||
                tag === "select" ||
                el.getAttribute("contenteditable") !== null;
            if (isFieldLike && !mayCaptureValue(el, safeSelectors)) continue;
            const own = directText(el);
            if (own) {
                const slice = own.slice(0, budget);
                parts.push(slice);
                budget -= slice.length;
                if (slice.length < own.length) truncated = true;
            }
            const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
            walk(el);
            if (shadow) walk(shadow);
        }
    };

    walk(document.body ?? document);
    return { text: parts.join(" ").slice(0, VISIBLE_TEXT_CAP), truncated };
}

// --- Snapshot assembly -------------------------------------------------------

/**
 * Capture the Visible Page Snapshot, enforcing the size budget and default-deny
 * field policy. `safeSelectors` is the per-surface safe-value allowlist (from
 * the iframe via init/config; empty by default — opt-in only via attribute).
 */
export function captureVisiblePageSnapshot(safeSelectors: string[] = []): VisiblePageSnapshot {
    // Rebuild the live-node index for this capture. Existing DOM nodes keep their
    // stamped handle ids, so a background recapture does not invalidate them just
    // because the map was refreshed.
    handleStore = new Map<string, Element>();

    const state = { partial: false };
    const linkCandidates: Candidate[] = [];
    const controlCandidates: Candidate[] = [];
    collect(document.body ?? document, linkCandidates, controlCandidates, state);

    const { text: visibleText, truncated: textTruncated } = captureVisibleText(
        state,
        safeSelectors,
    );

    const handles: ElementHandle[] = [];
    let truncated = textTruncated;
    let handleBudget = MAX_HANDLES;

    const issueHandle = (el: Element, name?: string): string | undefined => {
        if (handleBudget <= 0) {
            truncated = true;
            return undefined;
        }
        handleBudget--;
        const id = stamp(el);
        handles.push({
            id,
            selector: stableSelector(el),
            role: el.getAttribute("role") || el.tagName.toLowerCase(),
            name: name ?? accessibleName(el),
        });
        return id;
    };

    const links: VisibleLink[] = [];
    for (const { el } of linkCandidates) {
        if (links.length >= MAX_LINKS) {
            truncated = true;
            break;
        }
        const name = accessibleName(el);
        const handle = issueHandle(el, name);
        if (!handle) break;
        links.push({
            handle,
            label: name,
            href: (el as HTMLAnchorElement).href || el.getAttribute("href") || undefined,
        });
    }

    const controls: VisibleControl[] = [];
    for (const { el } of controlCandidates) {
        if (controls.length >= MAX_CONTROLS) {
            truncated = true;
            break;
        }
        const handle = issueHandle(el);
        if (!handle) break;
        const tag = el.tagName.toLowerCase();
        const isField =
            tag === "input" || tag === "textarea" || el.getAttribute("contenteditable") !== null;
        const value = isField && mayCaptureValue(el, safeSelectors) ? readValue(el) : undefined;
        const role = el.getAttribute("role") || el.getAttribute("type") || undefined;
        controls.push({
            handle,
            tag,
            role,
            label: fieldLabel(el) || accessibleName(el) || undefined,
            value,
        });
    }

    return {
        visibleText: visibleText || undefined,
        links: links.length ? links : undefined,
        controls: controls.length ? controls : undefined,
        handles: handles.length ? handles : undefined,
        truncated: truncated || undefined,
        partial: state.partial || undefined,
    };
}

/** Build a reasonably stable CSS selector used as a fingerprint fallback. */
function stableSelector(el: Element): string {
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

// --- Structured data the page already publishes (kept from the WS3 port) -----

/** Capture JSON-LD blocks + high-signal meta tags already in the page. */
function captureStructuredData(): PageStructuredData {
    const jsonLd: unknown[] = [];
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of Array.from(scripts)) {
        try {
            jsonLd.push(JSON.parse(script.textContent || "null"));
        } catch {
            // ignore malformed JSON-LD
        }
    }
    const meta: Record<string, string> = {};
    const tags = document.querySelectorAll("meta[property], meta[name]");
    for (const tag of Array.from(tags)) {
        const key = tag.getAttribute("property") || tag.getAttribute("name");
        const content = tag.getAttribute("content");
        // Keep the high-signal ones (OpenGraph, Twitter, description, etc.).
        if (key && content && /^(og:|twitter:|description$|author$|article:)/i.test(key)) {
            meta[key] = content;
        }
    }
    return { jsonLd, meta };
}

/** Capture explicit `data-ai-context` fields when a site provides them. */
function captureAiFields(): Record<string, string | undefined> {
    const fields: Record<string, string | undefined> = {};
    const nodes = document.querySelectorAll("[data-ai-context]");
    for (const node of Array.from(nodes)) {
        if (isExcludedSubtree(node) || !isVisible(node)) continue;
        const name = node.getAttribute("data-ai-context")?.trim();
        if (!name || hasSensitiveDescriptor(node, [name])) continue;
        const text = normalizeText(node.textContent || "").slice(0, FIELD_VALUE_CAP);
        if (name && text) fields[name] = text;
    }
    return fields;
}

/** Current text selection on the host page, if any. */
function captureSelection(): string | undefined {
    const selection = window.getSelection && String(window.getSelection()).trim();
    return selection || undefined;
}

/**
 * Capture the current page as a `PageContext`: the structured Visible Page
 * Snapshot (the primary payload), plus the page's published structured data,
 * and the user's selection. Throws only on a genuine DOM failure (the bridge
 * maps that to a `capture_error` frame — never a silent empty result).
 */
export function capturePageContext(safeSelectors: string[] = []): PageContext {
    return {
        url: location.href,
        path: location.pathname,
        title: document.title,
        selection: captureSelection(),
        structuredData: captureStructuredData(),
        aiFields: captureAiFields(),
        snapshot: captureVisiblePageSnapshot(safeSelectors),
    };
}
