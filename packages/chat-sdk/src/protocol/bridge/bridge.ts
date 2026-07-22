import type { ResolvedConfig } from "../../config/config.js";
import { TIMEOUTS } from "../../config/config.js";
import {
    type ClientToolCall,
    type ClientToolSpec,
    EMBED_SOURCE,
    type EmbedFrame,
    type PageContext,
    SDK_SOURCE,
    type SdkFrame,
    type SurfaceDisplaySettings,
} from "../types/index.js";
import { toCodedError } from "./errors.js";
import type { BridgeHandlers } from "./handlers.js";
import { withTimeout } from "./timeout.js";

/**
 * Distributive `Omit` so each member of the `SdkFrame` discriminated union keeps
 * its own shape when the shared envelope fields are stripped.
 */
type FramePayload = SdkFrame extends infer F
    ? F extends SdkFrame
        ? Omit<F, "source" | "protocolVersion">
        : never
    : never;

/**
 * How long a handled tool-call key is remembered for de-duplication after it
 * settles. Covers the window in which a timed-out (but still-running) approved
 * call could be re-issued and run a second time.
 */
const TOOL_DEDUPE_RETENTION_MS = 30_000;

/** The postMessage bridge. One instance per mounted iframe. */
export class Bridge {
    private readonly config: ResolvedConfig;
    private readonly handlers: BridgeHandlers;
    private readonly listener: (event: MessageEvent) => void;
    private iframeWindow: Window | null = null;
    private listening = false;
    private protocolAccepted = false;
    /** Recently-handled tool-call keys, kept briefly to de-dupe re-issued calls. */
    private readonly recentToolKeys = new Set<string>();

    constructor(config: ResolvedConfig, handlers: BridgeHandlers) {
        this.config = config;
        this.handlers = handlers;
        this.listener = (event) => this.onMessage(event);
    }

    /** Bind the iframe's contentWindow once it exists. */
    setIframeWindow(win: Window | null): void {
        if (win !== this.iframeWindow) {
            this.protocolAccepted = false;
        }
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
        this.send({ type: "AUTH_TOKEN", token, displaySettings });
    }

    /** Tell the iframe the asserted email is unavailable (no token issued, AC4). */
    sendUnavailable(
        email: string,
        message: string,
        accessRequestToken?: string,
        accessRequestExpiresIn?: number,
        messageIsCustom?: boolean,
    ): void {
        this.send({
            type: "UNAVAILABLE",
            email,
            message,
            messageIsCustom,
            accessRequestToken,
            accessRequestExpiresIn,
        });
    }

    /** Tell the iframe token acquisition failed before a session token was issued. */
    sendAuthError(message: string): void {
        this.send({ type: "AUTH_ERROR", message });
    }

    /** Tell the iframe which SDK-declared tools the host has registered. */
    sendRegisterTools(tools: ClientToolSpec[]): void {
        this.send({ type: "REGISTER_TOOLS", tools });
    }

    /** Apply the host page's current color mode without navigating the iframe. */
    sendHostTheme(theme: ResolvedConfig["theme"]): void {
        this.send({ type: "HOST_THEME", theme });
    }

    /** Stamp the shared envelope (source + protocolVersion) and post the frame. */
    private send(frame: FramePayload): void {
        this.post({
            ...frame,
            source: SDK_SOURCE,
            protocolVersion: this.config.protocolVersion,
        } as SdkFrame);
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
                this.protocolAccepted =
                    this.handlers.onReady(data.minProtocolVersion, data.maxProtocolVersion) !==
                    false;
                break;
            case "REQUEST_SNAPSHOT":
                if (!this.protocolAccepted) return;
                this.handleSnapshot(data.correlationId);
                break;
            case "CLIENT_TOOL_REQUEST":
                if (!this.protocolAccepted) return;
                void this.handleClientTool(data.correlationId, data.call);
                break;
            case "CONFIRMATION_RESULT":
                if (!this.protocolAccepted) return;
                this.handlers.onConfirmationResult?.(data.correlationId, data.approved);
                break;
            case "AUTH_EXPIRED":
                if (!this.protocolAccepted) return;
                this.handlers.onAuthExpired();
                break;
            case "MINIMIZE":
                if (!this.protocolAccepted) return;
                this.handlers.onMinimize?.();
                break;
            case "SURFACE_THEME":
                if (!this.protocolAccepted) return;
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
            this.send({
                type: "SNAPSHOT_ERROR",
                correlationId,
                code: "capture_error",
                message: err instanceof Error ? err.message : String(err),
            });
            return;
        }
        this.send({ type: "SNAPSHOT_RESULT", correlationId, context });
    }

    /** Run a client tool against its timeout; reply with result or typed error. */
    private async handleClientTool(correlationId: string, call: ClientToolCall): Promise<void> {
        // De-dupe re-issued approved calls: a slow mutating handler that finishes
        // after a timeout must not run again when the same call is re-sent.
        const dedupeKey = call.idempotencyKey ?? correlationId;
        if (this.recentToolKeys.has(dedupeKey)) return;
        this.recentToolKeys.add(dedupeKey);
        try {
            const result = await withTimeout(
                (signal) => this.handlers.onClientToolRequest(call, signal),
                TIMEOUTS.clientTool,
            );
            this.send({ type: "CLIENT_TOOL_RESULT", correlationId, result });
        } catch (err) {
            const coded = toCodedError(err);
            let snapshot: PageContext | undefined;
            try {
                snapshot = this.handlers.onSnapshotRequest();
            } catch {
                snapshot = undefined;
            }
            this.send({
                type: "CLIENT_TOOL_ERROR",
                correlationId,
                code: coded.code,
                message: coded.message,
                snapshot,
            });
        } finally {
            this.releaseToolKeyLater(dedupeKey);
        }
    }

    /** Forget a handled tool-call key after a short retention window. */
    private releaseToolKeyLater(key: string): void {
        const timer = setTimeout(() => this.recentToolKeys.delete(key), TOOL_DEDUPE_RETENTION_MS);
        (timer as unknown as { unref?: () => void }).unref?.();
    }
}
