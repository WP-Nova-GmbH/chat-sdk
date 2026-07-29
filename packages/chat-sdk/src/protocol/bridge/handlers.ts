import type {
    ClientToolCall,
    ClientToolResult,
    PageContext,
    PageWorkflowStatusFrame,
    SurfaceThemeFrame,
} from "../types/index.js";

/** Callbacks the host wires into the bridge to service iframe requests. */
export interface BridgeHandlers {
    /** Capture a fresh page snapshot. Throws → mapped to a `capture_error`. */
    onSnapshotRequest: (workflowCorrelationId?: string) => PageContext;
    /**
     * Run a client tool (navigation or integrator). Returns the result + a
     * fresh snapshot, or throws a typed error (NoHandler/HandlerThrew/Stale). The
     * `signal` aborts when the bridge times the round-trip out, so a cooperating
     * mutating handler can stop instead of completing after the error was posted.
     */
    onClientToolRequest: (call: ClientToolCall, signal: AbortSignal) => Promise<ClientToolResult>;
    /** The embedded-session token expired; re-fetch + re-push AUTH_TOKEN. */
    onAuthExpired: () => void;
    /**
     * The iframe announced READY; the host pushes the token + REGISTER_TOOLS.
     * Return false to reject the iframe protocol and fail closed.
     */
    onReady: (
        minVersion?: number,
        maxVersion?: number,
        capabilities?: readonly string[],
    ) => boolean | undefined;
    /** A confirmation decision arrived from the iframe (optional host hook). */
    onConfirmationResult?: (correlationId: string, approved: boolean) => void;
    /** The iframe's header asked to minimize; the host closes the panel. */
    onMinimize?: () => void;
    /** The iframe supplied validated surface theme values for SDK-owned chrome. */
    onSurfaceTheme?: (
        theme: Pick<SurfaceThemeFrame, "accent" | "triggerColor" | "triggerIconColor">,
    ) => void;
    /** The iframe acknowledged or declined an automatic page workflow. */
    onPageWorkflowStatus?: (
        status: Pick<PageWorkflowStatusFrame, "correlationId" | "status" | "resultId" | "message">,
    ) => void;
}
