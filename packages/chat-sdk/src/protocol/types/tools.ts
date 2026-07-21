import type { PageContext } from "./page.js";

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
    /**
     * Optional idempotency key. When the same approved call may be re-issued
     * (e.g. after a timeout) the SDK de-dupes on this key so a mutating handler
     * does not run twice. Falls back to the request correlationId when absent.
     */
    idempotencyKey?: string;
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

/**
 * A handler the integrator registers for an SDK-declared tool. The optional
 * second argument carries an `AbortSignal` the SDK aborts when the bridge times
 * the round-trip out, so a cooperating handler can stop a mutating action; it is
 * optional so existing one-argument handlers keep compiling.
 */
export type ToolHandler = (
    args: Record<string, unknown>,
    opts?: { signal?: AbortSignal },
) => unknown | Promise<unknown>;

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
