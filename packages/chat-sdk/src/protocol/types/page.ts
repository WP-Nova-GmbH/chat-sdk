// ---------------------------------------------------------------------------
// Page snapshot (Visible Page Snapshot — WS4)
// ---------------------------------------------------------------------------

/** Structured data the host page already publishes (parsed server-side). */
export interface PageStructuredData {
    /** Parsed `<script type="application/ld+json">` blocks (schema.org etc.). */
    jsonLd?: unknown[];
    /** Selected meta tags (OpenGraph, description, …) as name/property → content. */
    meta?: Record<string, string>;
}

/**
 * The page capture the SDK produces in the host page on `REQUEST_SNAPSHOT`.
 *
 * The primary payload is the structured Visible Page Snapshot (WS4): visible
 * structure/text/controls/labels, default-deny field values, stable element
 * handles, size budget + `truncated`/`partial` flags (see `snapshot.ts`). The
 * page's published structured data + selection are carried alongside. Raw DOM
 * HTML is intentionally not sent; arbitrary markup can contain ignored subtrees,
 * hidden inputs, and sensitive attributes that bypass the field-value policy.
 */
export interface PageContext {
    /** Full URL of the host page at capture time. */
    url: string;
    /** Pathname only (convenience for the agent / logging). */
    path?: string;
    /** `document.title` at capture time. */
    title?: string;
    /** Current text selection on the host page, if any. */
    selection?: string;
    /** Structured data already embedded in the page. */
    structuredData?: PageStructuredData;
    /** Explicit `data-ai-context` fields when a site provides them. */
    aiFields?: Record<string, string | undefined>;
    // --- WS4 Visible Page Snapshot (forward-declared; populated later) -------
    /** The structured Visible Page Snapshot (WS4). */
    snapshot?: VisiblePageSnapshot;
    /**
     * The integrator-declared site routes from `SdkConfig.routes`, carried with
     * every capture so the agent can navigate directly to known pages instead
     * of hopping through visible links.
     */
    siteRoutes?: SiteRoute[];
}

/**
 * An integrator-declared route of the host site: a same-origin path (optionally
 * with `:param` placeholders) plus a short description of what lives there.
 * Declared once via `SdkConfig.routes`; the backend treats it as untrusted data
 * and re-validates paths server-side.
 */
export interface SiteRoute {
    /** Same-origin path starting with "/"; may contain `:param` placeholders. */
    path: string;
    /**
     * Short description of the page — what it shows and, for `:param` routes,
     * where valid ids come from (e.g. "customer detail; open from /customers").
     */
    description: string;
}

/**
 * WS4 Visible Page Snapshot: visible structure/text/controls/labels, allowlisted
 * + sensitivity-checked field values, and stable element handles. Declared now
 * so the wire contract (and the iframe mirror) is stable before WS4 fills it in.
 */
export interface VisiblePageSnapshot {
    /** Visible page structure / text rendered for the agent. */
    visibleText?: string;
    /** Visible links: handle + accessible label + href. */
    links?: VisibleLink[];
    /** Visible interactive controls (buttons/inputs/selects) with handles. */
    controls?: VisibleControl[];
    /**
     * Visible field values intentionally withheld by the SDK's privacy policy.
     * Carries labels/types/reasons only — never the hidden value.
     */
    omittedValues?: OmittedFieldValue[];
    /**
     * Stable element handles issued this capture. Valid ONLY within the snapshot
     * they were issued with; every tool/navigation result returns a fresh
     * snapshot with re-issued handles.
     */
    handles?: ElementHandle[];
    /**
     * True when the snapshot was truncated to fit the size budget; signals the
     * agent it may request a scoped / expanded snapshot.
     */
    truncated?: boolean;
    /**
     * True when capture could not see the whole page (closed shadow roots,
     * cross-origin host iframes, canvas/WebGL, virtualized lists); signals the
     * agent that page context is incomplete.
     */
    partial?: boolean;
    /**
     * True when the post-action settle wait hit its cap: the page was still
     * mutating at capture time, so this snapshot may lag the last action.
     */
    unsettled?: boolean;
}

/** A captured visible link. */
export interface VisibleLink {
    /** Stable element handle id (resolved at action time). */
    handle: string;
    /** Accessible name / visible text. */
    label?: string;
    /** Resolved href. */
    href?: string;
    /** Nearby row/card/list context that helps identify the target. */
    context?: string;
}

/** A captured visible interactive control. */
export interface VisibleControl {
    /** Stable element handle id (resolved at action time). */
    handle: string;
    /** Tag (button|input|select|textarea|a|...). */
    tag: string;
    /** Control role / input type. */
    role?: string;
    /** Accessible name / associated label. */
    label?: string;
    /** Allowlisted + sensitivity-checked field value (default-deny — usually omitted). */
    value?: string;
    /** Nearby row/card/list context that helps identify the target. */
    context?: string;
}

/** Why a visible field value was withheld from the snapshot. */
export type FieldValueOmissionReason = "not_opted_in" | "sensitive";

/** Metadata for a visible field whose value was intentionally withheld. */
export interface OmittedFieldValue {
    /** Stable element handle id. */
    handle: string;
    /** Tag (input|select|textarea|...). */
    tag: string;
    /** Control role / input type. */
    role?: string;
    /** Accessible name / associated label. */
    label?: string;
    /** The privacy-policy reason the value was withheld. */
    reason: FieldValueOmissionReason;
}

/**
 * A stable element handle. The SDK stamps `data-wp-nova-h` on the element and
 * keeps an in-session WeakMap from id → node, plus a fingerprint fallback for
 * action-time resolution (attribute → fingerprint → STALE_HANDLE).
 */
export interface ElementHandle {
    /** Opaque handle id (matches the `data-wp-nova-h` attribute value). */
    id: string;
    /** Fallback selector used if the attribute is gone (SPA re-render). */
    selector?: string;
    /** ARIA role for fingerprint matching. */
    role?: string;
    /** Accessible name / text for fingerprint matching. */
    name?: string;
}
