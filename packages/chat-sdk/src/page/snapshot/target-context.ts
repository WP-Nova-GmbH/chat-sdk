import {
    CONTEXT_CONTAINER_HINT_RE,
    CONTEXT_CONTAINER_ROLES,
    CONTEXT_CONTAINER_TAGS,
    TARGET_CONTEXT_CAP,
    TARGET_CONTEXT_DEPTH,
} from "./constants.js";
import {
    directText,
    isExcludedSubtree,
    isValueField,
    isVisible,
    mayCaptureValue,
    normalizeText,
} from "./dom.js";

function isDescendantOf(node: Element, ancestor: Element): boolean {
    let current: Element | null = node;
    while (current) {
        if (current === ancestor) return true;
        current = current.parentElement;
    }
    return false;
}

function isTargetContextContainer(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    if (CONTEXT_CONTAINER_TAGS.has(tag)) return true;
    const role = el.getAttribute("role")?.toLowerCase();
    if (role && CONTEXT_CONTAINER_ROLES.has(role)) return true;
    const hints = [
        el.getAttribute("class"),
        el.getAttribute("data-testid"),
        el.getAttribute("part"),
    ].join(" ");
    return CONTEXT_CONTAINER_HINT_RE.test(hints);
}

function collectContextText(
    container: Element,
    target: Element,
    safeSelectors: string[],
): string | undefined {
    const parts: string[] = [];
    let budget = TARGET_CONTEXT_CAP;

    const append = (text: string): void => {
        if (!text || budget <= 0) return;
        const slice = text.slice(0, budget);
        parts.push(slice);
        budget -= slice.length;
    };

    const walk = (el: Element): void => {
        if (budget <= 0) return;
        if (el === target || isDescendantOf(el, target)) return;
        if (isExcludedSubtree(el) || !isVisible(el)) return;

        const tag = el.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript") return;
        if (tag === "iframe" || tag === "canvas") return;

        const fieldLike = isValueField(el);
        const mayReadOwnText = !fieldLike || mayCaptureValue(el, safeSelectors);
        if (mayReadOwnText) {
            append(directText(el));
        }
        if (fieldLike && !mayReadOwnText) {
            return;
        }

        for (const child of Array.from(el.children)) {
            walk(child);
            if (budget <= 0) return;
        }
        const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
        if (shadow) {
            const shadowChildren = (shadow as unknown as { children?: HTMLCollection }).children;
            for (const child of Array.from(shadowChildren ?? [])) {
                walk(child);
                if (budget <= 0) return;
            }
        }
    };

    walk(container);
    const context = normalizeText(parts.join(" "));
    return context ? context.slice(0, TARGET_CONTEXT_CAP) : undefined;
}

export function targetContext(
    target: Element,
    targetLabel: string | undefined,
    safeSelectors: string[],
): string | undefined {
    const normalizedTargetLabel = normalizeText(targetLabel ?? "").toLowerCase();
    let node = target.parentElement;
    let depth = 0;

    while (node && depth < TARGET_CONTEXT_DEPTH) {
        if (isTargetContextContainer(node)) {
            const context = collectContextText(node, target, safeSelectors);
            if (context && context.toLowerCase() !== normalizedTargetLabel) {
                return context;
            }
        }
        node = node.parentElement;
        depth++;
    }

    return undefined;
}
