// postMessage bridge between the SDK (host page) and the Nova-hosted iframe.
//
// Hardening vs the POC:
//   - Strict `event.origin` (must equal the iframe's exact origin) AND strict
//     `event.source` (must be the iframe's contentWindow) checks on every frame.
//   - Outbound postMessages target the validated iframe origin — NEVER "*".
//   - A bounded timeout on the tool round-trip (replacing the POC's single
//     global 1500 ms); on timeout we emit/return a typed `timeout` error rather
//     than silently dropping. Snapshot capture is synchronous, so it has no
//     timeout — a capture failure surfaces as a `capture_error` frame, not a
//     `timeout`.
//   - Typed `*_ERROR` frames distinct from a successful empty result (fixes the
//     POC's `resolve(null)` ambiguity).
//
// The bridge is transport-only: it owns frame validation, correlation, and
// timeouts. Capture/tool execution live in snapshot.ts / navigation.ts /
// tools.ts; the caller wires them in via the handler callbacks.

import type { ResolvedConfig } from "./config.js";
import { TIMEOUTS } from "./config.js";
import {
    type BridgeErrorCode,
    type ClientToolCall,
    type ClientToolResult,
    EMBED_SOURCE,
    type EmbedFrame,
    type PageContext,
    SDK_SOURCE,
    type SdkFrame,
    type SurfaceDisplaySettings,
    type SurfaceThemeFrame,
} from "./types.js";

/** Callbacks the host wires into the bridge to service iframe requests. */
export interface BridgeHandlers {
    /** Capture a fresh page snapshot. Throws → mapped to a `capture_error`. */
    onSnapshotRequest: () => PageContext;
    /**
     * Run a client tool (navigation or integrator). Returns the result + a
     * fresh snapshot, or throws a typed error (NoHandler/HandlerThrew/Stale).
     */
    onClientToolRequest: (call: ClientToolCall) => Promise<ClientToolResult>;
    /** The embedded-session token expired; re-fetch + re-push AUTH_TOKEN. */
    onAuthExpired: () => void;
    /** The iframe announced READY; the host pushes the token + REGISTER_TOOLS. */
    onReady: (minVersion?: number, maxVersion?: number) => void;
    /** A confirmation decision arrived from the iframe (optional host hook). */
    onConfirmationResult?: (correlationId: string, approved: boolean) => void;
    /** The iframe's header asked to minimize; the host closes the panel. */
    onMinimize?: () => void;
    /** The iframe supplied validated surface theme values for SDK-owned chrome. */
    onSurfaceTheme?: (
        theme: Pick<SurfaceThemeFrame, "accent" | "triggerColor" | "triggerIconColor">,
    ) => void;
}

/** A typed error carrying a `code` the bridge maps onto a `*_ERROR` frame. */
interface CodedError {
    code: BridgeErrorCode;
    message: string;
}

function toCodedError(err: unknown): CodedError {
    const code = (err as { code?: unknown })?.code;
    const rawMessage = (err as { message?: unknown })?.message;
    const message =
        typeof rawMessage === "string"
            ? rawMessage
            : err instanceof Error
              ? err.message
              : String(err);
    if (
        code === "no_handler" ||
        code === "stale_handle" ||
        code === "capture_error" ||
        code === "handler_threw" ||
        code === "timeout"
    ) {
        return { code, message };
    }
    return { code: "handler_threw", message };
}

/** Run `op` against a per-type timeout; reject with a `timeout` CodedError. */
function withTimeout<T>(op: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject({
                code: "timeout",
                message: `bridge operation timed out after ${ms}ms`,
            });
        }, ms);
        op.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}

/** The postMessage bridge. One instance per mounted iframe. */
export class Bridge {
    private readonly config: ResolvedConfig;
    private readonly handlers: BridgeHandlers;
    private readonly listener: (event: MessageEvent) => void;
    private iframeWindow: Window | null = null;
    private listening = false;

    constructor(config: ResolvedConfig, handlers: BridgeHandlers) {
        this.config = config;
        this.handlers = handlers;
        this.listener = (event) => this.onMessage(event);
    }

    /** Bind the iframe's contentWindow once it exists. */
    setIframeWindow(win: Window | null): void {
        this.iframeWindow = win;
    }

    /** Start listening for iframe → SDK frames (idempotent). */
    start(): void {
        if (this.listening) return;
        this.listening = true;
        window.addEventListener("message", this.listener);
    }

    /** Stop listening (on unmount). */
    stop(): void {
        if (!this.listening) return;
        this.listening = false;
        window.removeEventListener("message", this.listener);
    }

    /** Push the embedded-session Bearer token to the iframe. */
    sendAuthToken(token: string, displaySettings?: SurfaceDisplaySettings | null): void {
        this.post({
            source: SDK_SOURCE,
            protocolVersion: this.config.protocolVersion,
            type: "AUTH_TOKEN",
            token,
            displaySettings,
        });
    }

    /** Tell the iframe the asserted email is unavailable (no token issued, AC4). */
    sendUnavailable(email: string, message: string): void {
        this.post({
            source: SDK_SOURCE,
            protocolVersion: this.config.protocolVersion,
            type: "UNAVAILABLE",
            email,
            message,
        });
    }

    /** Tell the iframe which integrator tool handlers the host has registered. */
    sendRegisterTools(tools: string[]): void {
        this.post({
            source: SDK_SOURCE,
            protocolVersion: this.config.protocolVersion,
            type: "REGISTER_TOOLS",
            tools,
        });
    }

    /** Post an SDK frame to the iframe at its validated origin (never "*"). */
    private post(frame: SdkFrame): void {
        if (!this.iframeWindow) return;
        this.iframeWindow.postMessage(frame, this.config.iframeOrigin);
    }

    /** Validate + dispatch an inbound message event. */
    private onMessage(event: MessageEvent): void {
        // Strict origin: only the iframe's exact origin.
        if (event.origin !== this.config.iframeOrigin) return;
        // Strict source: only our iframe's contentWindow.
        if (!this.iframeWindow || event.source !== this.iframeWindow) return;
        const data = event.data as EmbedFrame | undefined;
        if (!data || data.source !== EMBED_SOURCE) return;

        switch (data.type) {
            case "READY":
                this.handlers.onReady(data.minProtocolVersion, data.maxProtocolVersion);
                break;
            case "REQUEST_SNAPSHOT":
                this.handleSnapshot(data.correlationId);
                break;
            case "CLIENT_TOOL_REQUEST":
                void this.handleClientTool(data.correlationId, data.call);
                break;
            case "CONFIRMATION_RESULT":
                this.handlers.onConfirmationResult?.(data.correlationId, data.approved);
                break;
            case "AUTH_EXPIRED":
                this.handlers.onAuthExpired();
                break;
            case "MINIMIZE":
                this.handlers.onMinimize?.();
                break;
            case "SURFACE_THEME":
                this.handlers.onSurfaceTheme?.({
                    accent: data.accent,
                    triggerColor: data.triggerColor,
                    triggerIconColor: data.triggerIconColor,
                });
                break;
            // CONFIRMATION_REQUEST is owned by the iframe UI; the SDK ignores it
            // and only ever runs an approved CLIENT_TOOL_REQUEST.
            default:
                break;
        }
    }

    /** Capture a snapshot synchronously; reply with result or a typed error. */
    private handleSnapshot(correlationId: string): void {
        let context: PageContext;
        try {
            context = this.handlers.onSnapshotRequest();
        } catch (err) {
            this.post({
                source: SDK_SOURCE,
                protocolVersion: this.config.protocolVersion,
                type: "SNAPSHOT_ERROR",
                correlationId,
                code: "capture_error",
                message: err instanceof Error ? err.message : String(err),
            });
            return;
        }
        this.post({
            source: SDK_SOURCE,
            protocolVersion: this.config.protocolVersion,
            type: "SNAPSHOT_RESULT",
            correlationId,
            context,
        });
    }

    /** Run a client tool against its timeout; reply with result or typed error. */
    private async handleClientTool(correlationId: string, call: ClientToolCall): Promise<void> {
        try {
            const result = await withTimeout(
                this.handlers.onClientToolRequest(call),
                TIMEOUTS.clientTool,
            );
            this.post({
                source: SDK_SOURCE,
                protocolVersion: this.config.protocolVersion,
                type: "CLIENT_TOOL_RESULT",
                correlationId,
                result,
            });
        } catch (err) {
            const coded = toCodedError(err);
            let snapshot: PageContext | undefined;
            try {
                snapshot = this.handlers.onSnapshotRequest();
            } catch {
                snapshot = undefined;
            }
            this.post({
                source: SDK_SOURCE,
                protocolVersion: this.config.protocolVersion,
                type: "CLIENT_TOOL_ERROR",
                correlationId,
                code: coded.code,
                message: coded.message,
                snapshot,
            });
        }
    }
}
