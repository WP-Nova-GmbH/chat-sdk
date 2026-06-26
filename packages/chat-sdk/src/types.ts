// Bridge protocol contract for the WP-38 embedded chat SDK.
//
// This file is the SINGLE SOURCE OF TRUTH for the postMessage wire protocol
// between the SDK (host page) and the Nova-hosted iframe. It is self-contained:
// the SDK ships dependency-free, so it does NOT import @wp-nova/types. When the
// iframe (WS7) mirrors these shapes it must match them byte-for-byte.
//
// Conventions:
//   - Every frame carries `source` (who sent it) and `protocolVersion`.
//   - Request/response pairs carry a `correlationId` so the SDK can route a
//     reply back to the pending request and so g8way can line a tool round-trip
//     up with the server-side toolCallId.
//   - Errors are EXPLICIT `*_ERROR` frames, never a successful-but-empty result
//     (the POC's `resolve(null)` ambiguity is fixed here).

/** Current bridge protocol version. Bumped on any breaking wire change. */
export const PROTOCOL_VERSION = 2;

/** Sender tag for frames originating in the SDK (host page → iframe). */
export const SDK_SOURCE = "wp-nova-ext" as const;
/** Sender tag for frames originating in the iframe (iframe → host page). */
export const EMBED_SOURCE = "wp-nova-embed" as const;

export type SdkSource = typeof SDK_SOURCE;
export type EmbedSource = typeof EMBED_SOURCE;
export type BridgeSource = SdkSource | EmbedSource;

/**
 * Error codes carried by every `*_ERROR` frame on the tool / navigation /
 * snapshot path. Distinct from a successful empty result so the iframe (and
 * core-ai, downstream) can tell "the page genuinely had nothing" from "the
 * capture failed" / "no handler" / "timed out".
 */
export type BridgeErrorCode =
    /** A response did not arrive within the per-message-type timeout. */
    | "timeout"
    /** No integrator tool handler was registered for the requested tool name. */
    | "no_handler"
    /** A stable element handle could not be resolved against the live DOM. */
    | "stale_handle"
    /** Snapshot capture threw while reading the host DOM. */
    | "capture_error"
    /** A registered integrator handler threw or rejected. */
    | "handler_threw";

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

// ---------------------------------------------------------------------------
// Integrator-defined page tools
// ---------------------------------------------------------------------------

/**
 * A model-callable tool declared by the host SDK integration. This is the
 * browser-to-iframe wire shape; public SDK registration uses `inputSchema` and
 * the SDK translates it to this `args_schema` field before posting.
 */
export interface ClientToolSpec {
    /** Unique tool name. Use lowercase letters, numbers, and underscores. */
    name: string;
    /** Agent-facing instruction for when and how to call the tool. */
    description: string;
    /** JSON Schema object for tool arguments. */
    args_schema: Record<string, unknown>;
    /** True when the handler changes page state or customer data. */
    mutating: boolean;
    /** Required confirmation copy for mutating tools. */
    confirmationCopy?: string;
}

/**
 * A client tool the agent asked to run in the host page — either a built-in
 * navigation action or an integrator-declared tool. `mutating` is decided
 * SERVER-SIDE and is authoritative; the SDK never classifies mutations.
 */
export interface ClientToolCall {
    /** Tool name (matches a registered handler or a navigation action). */
    name: string;
    /** Tool arguments (JSON-serializable). */
    args?: Record<string, unknown>;
    /**
     * Server-decided mutation flag. When true the iframe shows the confirmation
     * UI and only relays an approved request to the SDK.
     */
    mutating?: boolean;
    /** Confirmation copy shown by the iframe for a mutating tool. */
    confirmationCopy?: string;
}

/** Result of running a client tool in the host page. */
export interface ClientToolResult {
    /** JSON-serializable tool result returned to core-ai as the ToolMessage. */
    result?: unknown;
    /** Fresh snapshot captured AFTER the tool ran (re-issued handles). */
    snapshot?: PageContext;
}

/** Trusted display settings for the embedded surface. */
export interface SurfaceDisplaySettings {
    /** Header title shown inside the iframe. */
    title?: string;
    /** Header logo URL, when available from the authenticated surface lookup. */
    logo?: string;
    /** Chat accent color. */
    accent?: string;
    /** Optional launcher/open-button color. */
    triggerColor?: string;
    /** Launcher icon color: light, dark, or a custom hex color. */
    triggerIconColor?: string;
}

/** A handler the integrator registers for an SDK-declared tool. */
export type ToolHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

/** Public SDK definition for one model-callable host-page tool. */
export interface ToolDefinition {
    /** Unique tool name. Use lowercase letters, numbers, and underscores. */
    name: string;
    /** Agent-facing instruction for when and how to call the tool. */
    description: string;
    /** JSON Schema object for tool arguments. */
    inputSchema: Record<string, unknown>;
    /** True when the handler changes page state or customer data. */
    mutating: boolean;
    /** Required confirmation copy for mutating tools. */
    confirmationCopy?: string;
    /** Executes inside the host app when the agent calls this tool. */
    handler: ToolHandler;
}

// ---------------------------------------------------------------------------
// Wire frames — SDK → iframe (source = "wp-nova-ext")
// ---------------------------------------------------------------------------

/** Common fields on every frame in either direction. */
interface FrameBase {
    /** Who sent the frame. */
    source: BridgeSource;
    /** Protocol version the sender speaks. */
    protocolVersion: number;
}

/** Push the embedded-session Bearer token to the iframe (initial + re-mint). */
export interface AuthTokenFrame extends FrameBase {
    source: SdkSource;
    type: "AUTH_TOKEN";
    /** The short-lived embedded-session token from the customer's tokenEndpoint. */
    token: string;
    /** Trusted first-paint surface display settings, when the tokenEndpoint provides them. */
    displaySettings?: SurfaceDisplaySettings | null;
}

/** Reply to a `REQUEST_SNAPSHOT`: the captured page context. */
export interface SnapshotResultFrame extends FrameBase {
    source: SdkSource;
    type: "SNAPSHOT_RESULT";
    correlationId: string;
    context: PageContext;
}

/** Error reply to a `REQUEST_SNAPSHOT` (capture threw / page-reading disabled). */
export interface SnapshotErrorFrame extends FrameBase {
    source: SdkSource;
    type: "SNAPSHOT_ERROR";
    correlationId: string;
    code: BridgeErrorCode;
    message: string;
}

/** Reply to a `CLIENT_TOOL_REQUEST`: result + a fresh post-action snapshot. */
export interface ClientToolResultFrame extends FrameBase {
    source: SdkSource;
    type: "CLIENT_TOOL_RESULT";
    /** Equals the request correlationId == the server toolCallId. */
    correlationId: string;
    result: ClientToolResult;
}

/** Error reply to a `CLIENT_TOOL_REQUEST` (no handler / stale handle / threw). */
export interface ClientToolErrorFrame extends FrameBase {
    source: SdkSource;
    type: "CLIENT_TOOL_ERROR";
    correlationId: string;
    code: BridgeErrorCode;
    message: string;
    /**
     * Best-effort fresh snapshot captured after the failure. Especially useful
     * for `stale_handle`: the model can retry from current handles instead of
     * asking the user to refresh manually. Omitted when capture itself fails.
     */
    snapshot?: PageContext;
}

/** Hand the iframe the model-callable tools declared by the SDK integration. */
export interface RegisterToolsFrame extends FrameBase {
    source: SdkSource;
    type: "REGISTER_TOOLS";
    /** SDK-declared tool specs. Handler-only legacy registrations are excluded. */
    tools: ClientToolSpec[];
}

/**
 * Tell the iframe the asserted email did not resolve to an active tenant user
 * (the `{ unavailable }` outcome from POST /embed/session, passed through the
 * customer's tokenEndpoint). The iframe renders the unavailable-user state and
 * creates no thread/message; no token is issued (AC4).
 */
export interface UnavailableFrame extends FrameBase {
    source: SdkSource;
    type: "UNAVAILABLE";
    /** The email that needs access requested from the platform administrator. */
    email: string;
    /** Message rendered from the surface's unavailableUserMessageTemplate. */
    message: string;
}

/** Tell the iframe token acquisition failed for transport or malformed-response reasons. */
export interface AuthErrorFrame extends FrameBase {
    source: SdkSource;
    type: "AUTH_ERROR";
    /** User-renderable transport/error message. No token was issued. */
    message: string;
}

/** Union of every frame the SDK sends to the iframe. */
export type SdkFrame =
    | AuthTokenFrame
    | SnapshotResultFrame
    | SnapshotErrorFrame
    | ClientToolResultFrame
    | ClientToolErrorFrame
    | RegisterToolsFrame
    | UnavailableFrame
    | AuthErrorFrame;

// ---------------------------------------------------------------------------
// Wire frames — iframe → SDK (source = "wp-nova-embed")
// ---------------------------------------------------------------------------

/**
 * The iframe finished loading and is ready to receive `AUTH_TOKEN`. Announces
 * the protocol version range it supports so the SDK can detect skew (the SDK is
 * customer-pinned while the Nova-hosted iframe rolls forward).
 */
export interface ReadyFrame extends FrameBase {
    source: EmbedSource;
    type: "READY";
    /** Lowest protocol version the iframe still supports. */
    minProtocolVersion?: number;
    /** Highest protocol version the iframe supports. */
    maxProtocolVersion?: number;
}

/** The iframe asks the SDK for a fresh page snapshot. */
export interface RequestSnapshotFrame extends FrameBase {
    source: EmbedSource;
    type: "REQUEST_SNAPSHOT";
    correlationId: string;
}

/** The iframe asks the SDK to run a client tool (after any confirmation gate). */
export interface ClientToolRequestFrame extends FrameBase {
    source: EmbedSource;
    type: "CLIENT_TOOL_REQUEST";
    /** correlationId == the server toolCallId forwarded to /tool-result. */
    correlationId: string;
    call: ClientToolCall;
}

/**
 * The iframe asks the SDK to surface a confirmation for a mutating tool. The
 * iframe OWNS the confirmation UI; this frame exists for hosts that want to
 * render confirmation in their own chrome. The SDK only ever runs an approved
 * `CLIENT_TOOL_REQUEST`.
 */
export interface ConfirmationRequestFrame extends FrameBase {
    source: EmbedSource;
    type: "CONFIRMATION_REQUEST";
    correlationId: string;
    call: ClientToolCall;
}

/** The iframe announces the user's confirmation decision. */
export interface ConfirmationResultFrame extends FrameBase {
    source: EmbedSource;
    type: "CONFIRMATION_RESULT";
    correlationId: string;
    /** True when the user approved the mutating action. */
    approved: boolean;
}

/**
 * The iframe's embedded-session token expired (or a 401 was hit). Triggers the
 * SDK to re-fetch from the customer's tokenEndpoint and re-push `AUTH_TOKEN`.
 */
export interface AuthExpiredFrame extends FrameBase {
    source: EmbedSource;
    type: "AUTH_EXPIRED";
}

/**
 * The user minimized the chat from inside the iframe (the header's ⌄ control).
 * The launcher and the in-iframe header are the two ways to close the panel; this
 * frame lets the iframe-owned header drive the SDK-owned panel without coupling
 * the two chromes. The SDK responds by closing the panel (the iframe keeps its
 * conversation state, so re-opening resumes where the user left off).
 */
export interface MinimizeFrame extends FrameBase {
    source: EmbedSource;
    type: "MINIMIZE";
}

/**
 * The validated surface theme the iframe asks the SDK to apply to SDK-owned
 * host chrome. Sent only after embedded-session auth succeeds; old SDKs ignore
 * the unknown frame.
 */
export interface SurfaceThemeFrame extends FrameBase {
    source: EmbedSource;
    type: "SURFACE_THEME";
    /** Chat accent color. Used as the launcher fallback when triggerColor is absent. */
    accent?: string | null;
    /** Optional launcher/open-button color. */
    triggerColor?: string | null;
    /** Launcher icon color: light, dark, or a custom hex color. */
    triggerIconColor?: string | null;
}

/** Union of every frame the iframe sends to the SDK. */
export type EmbedFrame =
    | ReadyFrame
    | RequestSnapshotFrame
    | ClientToolRequestFrame
    | ConfirmationRequestFrame
    | ConfirmationResultFrame
    | AuthExpiredFrame
    | MinimizeFrame
    | SurfaceThemeFrame;

/** Any bridge frame in either direction. */
export type BridgeFrame = SdkFrame | EmbedFrame;

// ---------------------------------------------------------------------------
// tokenEndpoint contract (customer backend → SDK)
// ---------------------------------------------------------------------------

/**
 * The customer's `tokenEndpoint` proxies `POST /embed/session` and MUST pass
 * through BOTH outcomes so AC4 (unavailable user) works without a token:
 *   - resolved user  → { access_token, expires_in }
 *   - unmatched email → { unavailable: true, email, message }
 */
export type TokenEndpointResponse = TokenGrantResponse | UnavailableUserResponse;

/** Resolved-user outcome: a short-lived embedded-session token. */
export interface TokenGrantResponse {
    /** The embedded-session Bearer token. */
    access_token: string;
    /** Token lifetime in seconds (drives proactive re-mint at ~80%). */
    expires_in: number;
    /** Trusted first-paint surface display settings from Nova, if passed through. */
    displaySettings?: SurfaceDisplaySettings | null;
    /**
     * True when the surface is in development origin mode. The SDK marks the
     * launcher with a development badge so test embeds are unmistakable. Absent
     * (treated as false) for production surfaces.
     */
    developmentMode?: boolean;
    unavailable?: false;
}

/** Unmatched-email outcome: render the unavailable-user state, no token. */
export interface UnavailableUserResponse {
    unavailable: true;
    /** The email the platform backend asserted (echoed for the UI). */
    email: string;
    /** Message rendered from the surface's unavailableUserMessageTemplate. */
    message: string;
    access_token?: undefined;
}

/**
 * Typed token-acquisition outcome surfaced internally by the SDK. Distinguishes
 * a transport/network failure from the legitimate unavailable-user state so the
 * iframe can render them differently.
 */
export type TokenResult =
    | {
          kind: "granted";
          token: string;
          expiresIn: number;
          displaySettings?: SurfaceDisplaySettings | null;
          /** True when the surface is in development origin mode (badge the launcher). */
          developmentMode?: boolean;
      }
    | { kind: "unavailable"; email: string; message: string }
    | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// SDK init config
// ---------------------------------------------------------------------------

/** Public configuration passed to `WpNova('init', config)` / `<wp-nova-chat>`. */
export interface SdkConfig {
    /**
     * Non-secret, SDK-facing surface handle. The ONLY identifier that crosses
     * the browser boundary; used for pre-auth theming and in the tokenEndpoint
     * exchange. (The internal surface id never reaches the browser.)
     */
    publicSurfaceId: string;
    /**
     * The customer's own backend endpoint that mints an embedded-session token.
     * The SDK fetches the token from HERE — never from Nova directly with the
     * integration secret.
     */
    tokenEndpoint: string;
    /**
     * Base URL of the Nova-hosted iframe app. The iframe is mounted at
     * `<baseUrl>/embed/chat`. Defaults to the production chat host.
     */
    baseUrl?: string;
    /** Host DOM element (or selector) to mount into; defaults to document.body. */
    mount?: string | HTMLElement;
    /** Launcher / panel title shown before surface theming arrives. */
    title?: string;
    /** Accent color for the pre-auth launcher shell. */
    accent?: string;
    /**
     * Optional launcher/open-button color for the pre-auth shell. When omitted,
     * the launcher uses `accent`.
     */
    triggerColor?: string;
    /** Launcher icon color for the pre-auth shell: "light", "dark", or a hex color. */
    triggerIconColor?: string;
    /**
     * Per-surface safe-value selector allowlist. A field value is captured in
     * the Visible Page Snapshot ONLY when it opts in (via `data-wp-nova-include`
     * or by matching one of these selectors) AND passes every sensitivity check.
     * Default-deny: omit this and no field values are captured unless attributed.
     */
    safeValueSelectors?: string[];
    /**
     * Enables embedded voice mode and delegates microphone permission to the
     * Nova-hosted iframe. Defaults to false, so embeds do not receive microphone
     * eligibility unless the host opts in.
     */
    voiceMode?: boolean;
    /** Protocol version the SDK speaks (defaults to PROTOCOL_VERSION). */
    protocolVersion?: number;
}
