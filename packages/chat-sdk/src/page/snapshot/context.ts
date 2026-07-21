import type { PageContext, PageStructuredData } from "../../protocol/types/index.js";
import { captureVisiblePageSnapshot } from "./capture.js";
import { FIELD_VALUE_CAP } from "./constants.js";
import { hasSensitiveDescriptor, isExcludedSubtree, isVisible, normalizeText } from "./dom.js";

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
