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

import type { HostTheme, PageWorkflowDefinition } from "./config.js";
import type { PageContext } from "./page.js";
import type {
    ClientToolCall,
    ClientToolResult,
    ClientToolSpec,
    SurfaceDisplaySettings,
} from "./tools.js";

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
    /** Whether message is administrator-authored rather than Nova's default. */
    messageIsCustom?: boolean;
    /** Purpose-scoped access-request capability; optional for older Nova backends. */
    accessRequestToken?: string;
    /** Capability lifetime in seconds. */
    accessRequestExpiresIn?: number;
    /** Whether explicit JIT user creation is available for this identity. */
    userCreationRequired?: boolean;
    /** Purpose-scoped capability accepted only by Nova's user-creation endpoint. */
    userCreationToken?: string;
    /** User-creation capability lifetime in seconds. */
    userCreationExpiresIn?: number;
}

/** Tell the iframe token acquisition failed for transport or malformed-response reasons. */
export interface AuthErrorFrame extends FrameBase {
    source: SdkSource;
    type: "AUTH_ERROR";
    /** User-renderable transport/error message. No token was issued. */
    message: string;
}

/**
 * Apply the host page's current color mode inside the embedded chat. This is
 * independent of Nova surface branding and any cookie owned by the iframe.
 */
export interface HostThemeFrame extends FrameBase {
    source: SdkSource;
    type: "HOST_THEME";
    theme: HostTheme;
}

/** Keep the hosted iframe synchronized with SDK-owned launcher/panel state. */
export interface HostOpenStateFrame extends FrameBase {
    source: SdkSource;
    type: "HOST_OPEN_STATE";
    open: boolean;
}

/**
 * Start one configured workflow against a page the host explicitly marked
 * ready. The iframe captures fresh context before invoking the backend.
 */
export interface StartPageWorkflowFrame extends FrameBase {
    source: SdkSource;
    type: "START_PAGE_WORKFLOW";
    correlationId: string;
    workflow: PageWorkflowDefinition;
    /** Exact page URL recorded when the host reported readiness. */
    expectedUrl: string;
}

/**
 * Withdraw a workflow trigger that the iframe has not acknowledged as started.
 * The iframe must ignore this frame once backend execution has begun.
 */
export interface CancelPageWorkflowFrame extends FrameBase {
    source: SdkSource;
    type: "CANCEL_PAGE_WORKFLOW";
    correlationId: string;
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
    | AuthErrorFrame
    | HostThemeFrame
    | HostOpenStateFrame
    | StartPageWorkflowFrame
    | CancelPageWorkflowFrame;

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
    /** Additive features the rolling iframe understands at this protocol version. */
    capabilities?: Array<"page-workflows">;
}

/** The iframe asks the SDK for a fresh page snapshot. */
export interface RequestSnapshotFrame extends FrameBase {
    source: EmbedSource;
    type: "REQUEST_SNAPSHOT";
    correlationId: string;
    /**
     * START_PAGE_WORKFLOW correlation when this capture is for an automatic
     * workflow. Omitted for ordinary chat and client-tool snapshots.
     */
    workflowCorrelationId?: string;
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

/** Lifecycle acknowledgement for an automatically-started page workflow. */
export interface PageWorkflowStatusFrame extends FrameBase {
    source: EmbedSource;
    type: "PAGE_WORKFLOW_STATUS";
    correlationId: string;
    status: "started" | "cached" | "completed" | "failed" | "skipped";
    /** Standalone workflow result made available by Nova Ark. */
    resultId?: string;
    /** Optional user-safe diagnostic for skipped/failed attempts. */
    message?: string;
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
    | SurfaceThemeFrame
    | PageWorkflowStatusFrame;

/** Any bridge frame in either direction. */
export type BridgeFrame = SdkFrame | EmbedFrame;
