import type {
    ElementHandle,
    OmittedFieldValue,
    VisibleControl,
    VisibleLink,
    VisiblePageSnapshot,
} from "../../protocol/types/index.js";
import {
    CONTROL_TAGS,
    MAX_CONTROLS,
    MAX_HANDLES,
    MAX_LINKS,
    MAX_OMITTED_VALUES,
    VISIBLE_TEXT_CAP,
} from "./constants.js";
import {
    accessibleName,
    controlLabel,
    directText,
    elementRenderState,
    getValueCaptureDecision,
    hasFieldValue,
    isExcludedSubtree,
    isValueField,
    mayCaptureValue,
    readValue,
    type ValueCaptureDecision,
} from "./dom.js";
import { beginHandleCapture, stableSelector, stamp } from "./handles.js";
import { targetContext } from "./target-context.js";

// --- Traversal ---------------------------------------------------------------

/** A visible candidate element collected during traversal. */
interface Candidate {
    el: Element;
}

/** Visible-text accumulation state, filled during the single collect() pass. */
interface TextAccumulator {
    parts: string[];
    budget: number;
    truncated: boolean;
}

/**
 * Walk the composed tree from `root`, descending into OPEN shadow roots, and in a
 * SINGLE pass collect visible links + controls AND accumulate the visible text
 * the user can read (bounded by VISIBLE_TEXT_CAP, with the same default-deny
 * field-value gate). Sets `state.partial` when a region cannot be read (closed
 * shadow root / cross-origin iframe / canvas).
 *
 * `textReachable` tracks whether the current path is still on an unbroken visible,
 * non-field-gated spine from the body. Text is accumulated only along that spine
 * (matching the previous standalone text walk), while link/control collection —
 * which descends through invisible regions to find visible descendants — is
 * unaffected. Fusing the two walks halves the forced style/layout reads.
 */
function collect(
    root: ParentNode,
    links: Candidate[],
    controls: Candidate[],
    state: { partial: boolean },
    text: TextAccumulator,
    safeSelectors: string[],
    textReachable: boolean,
): void {
    const children = (root as Element).children ?? (root as Document).children;
    if (!children) return;
    for (const el of Array.from(children)) {
        if (isExcludedSubtree(el)) continue;
        const renderState = elementRenderState(el);
        if (!renderState.descendantsMayRender) continue;

        const tag = el.tagName.toLowerCase();

        // Out-of-scope regions: mark partial, do not descend.
        if (tag === "iframe" || tag === "canvas") {
            state.partial = true;
            continue;
        }
        // Closed shadow root: the host element renders but its internals are
        // unreadable. (Open roots expose `.shadowRoot`; closed ones return null.)
        const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;

        if (renderState.visible) {
            if (tag === "a" && el.getAttribute("href")) {
                links.push({ el });
            } else if (CONTROL_TAGS.has(tag) || el.getAttribute("contenteditable") !== null) {
                controls.push({ el });
            }
        }

        // Visible-text accumulation along the visible / non-gated spine.
        let childTextReachable = textReachable;
        if (textReachable) {
            if (text.budget <= 0) {
                text.truncated = true;
            } else if (tag === "script" || tag === "style" || tag === "noscript") {
                childTextReachable = false;
            } else if (isValueField(el) && !mayCaptureValue(el, safeSelectors)) {
                // Default-deny field-value gate: omit typed text unless opted in.
                childTextReachable = false;
            } else {
                // Direct text nodes only (avoids duplicating descendant text and
                // prevents ignored descendants leaking via parent textContent).
                const own = renderState.rendersOwnText ? directText(el) : "";
                if (own) {
                    const separatorLength = text.parts.length > 0 ? 1 : 0;
                    if (text.budget <= separatorLength) {
                        text.truncated = true;
                    } else {
                        text.budget -= separatorLength;
                        const slice = own.slice(0, text.budget);
                        text.parts.push(slice);
                        text.budget -= slice.length;
                        if (slice.length < own.length) text.truncated = true;
                    }
                }
            }
        }

        // Descend into the light DOM and any OPEN shadow root.
        collect(el, links, controls, state, text, safeSelectors, childTextReachable);
        if (shadow) {
            collect(shadow, links, controls, state, text, safeSelectors, childTextReachable);
        }
    }
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
    beginHandleCapture();

    const state = { partial: false };
    const linkCandidates: Candidate[] = [];
    const controlCandidates: Candidate[] = [];
    const text: TextAccumulator = { parts: [], budget: VISIBLE_TEXT_CAP, truncated: false };
    collect(
        document.body ?? document,
        linkCandidates,
        controlCandidates,
        state,
        text,
        safeSelectors,
        true,
    );

    const visibleText = text.parts.join(" ").slice(0, VISIBLE_TEXT_CAP);
    const textTruncated = text.truncated;

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
        const context = targetContext(el, name, safeSelectors);
        links.push({
            handle,
            label: name,
            href: (el as HTMLAnchorElement).href || el.getAttribute("href") || undefined,
            ...(context ? { context } : {}),
        });
    }

    const controls: VisibleControl[] = [];
    const omittedValues: OmittedFieldValue[] = [];
    for (const { el } of controlCandidates) {
        if (controls.length >= MAX_CONTROLS) {
            truncated = true;
            break;
        }
        const tag = el.tagName.toLowerCase();
        const isField = isValueField(el);
        const role = el.getAttribute("role") || el.getAttribute("type") || undefined;
        const label = controlLabel(el) || undefined;
        const handle = issueHandle(el, isField ? (label ?? "") : undefined);
        if (!handle) break;
        const valueDecision: ValueCaptureDecision = isField
            ? getValueCaptureDecision(el, safeSelectors)
            : { allowed: false };
        const value = isField && valueDecision.allowed ? readValue(el) : undefined;
        const context = targetContext(el, label, safeSelectors);
        controls.push({
            handle,
            tag,
            role,
            label,
            value,
            ...(context ? { context } : {}),
        });
        if (
            isField &&
            !valueDecision.allowed &&
            valueDecision.omissionReason &&
            hasFieldValue(el)
        ) {
            if (omittedValues.length >= MAX_OMITTED_VALUES) {
                truncated = true;
            } else {
                omittedValues.push({
                    handle,
                    tag,
                    role,
                    label,
                    reason: valueDecision.omissionReason,
                });
            }
        }
    }

    return {
        visibleText: visibleText || undefined,
        links: links.length ? links : undefined,
        controls: controls.length ? controls : undefined,
        omittedValues: omittedValues.length ? omittedValues : undefined,
        handles: handles.length ? handles : undefined,
        truncated: truncated || undefined,
        partial: state.partial || undefined,
    };
}
