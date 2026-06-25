// Integrator tool handler registry.
//
// Server-declared `pageTools` on the EmbeddedChatSurface determine what the
// agent CAN call; the host supplies matching execution callbacks via
// `WpNova('registerToolHandler', name, fn)`. The two are decoupled: a tool can
// be declared server-side with no host handler registered (yet or ever), so a
// `CLIENT_TOOL_REQUEST` for an unregistered tool returns a typed
// `no_handler` error frame rather than hanging.
//
// Timing contract (WS6):
//   - The registry is populatable BEFORE or AFTER init (the queued snippet
//     buffers `registerToolHandler` calls made before init).
//   - `REGISTER_TOOLS` is sent on `READY` and re-sent whenever the registry
//     changes, so the iframe always knows which handlers exist.

import { StaleHandleError } from "./navigation.js";
import { capturePageContext } from "./snapshot.js";
import type { ClientToolCall, ClientToolResult, ToolHandler } from "./types.js";

/**
 * Thrown when a registered integrator handler itself throws / rejects. Mapped
 * by the bridge to a `CLIENT_TOOL_ERROR(code="handler_threw")` frame.
 */
export class HandlerThrewError extends Error {
    readonly code = "handler_threw" as const;
    constructor(name: string, cause: unknown) {
        super(`tool handler "${name}" threw: ${describe(cause)}`);
        this.name = "HandlerThrewError";
    }
}

/**
 * Thrown when no handler is registered for a requested tool. Mapped by the
 * bridge to a `CLIENT_TOOL_ERROR(code="no_handler")` frame so the iframe POSTs a
 * ToolMessage error and core-ai continues (telling the user the tool isn't
 * wired) instead of wedging on a dangling tool_call.
 */
export class NoHandlerError extends Error {
    readonly code = "no_handler" as const;
    constructor(name: string) {
        super(`no registered handler for tool "${name}"`);
        this.name = "NoHandlerError";
    }
}

function describe(cause: unknown): string {
    if (cause instanceof Error) return cause.message;
    try {
        return String(cause);
    } catch {
        return "unknown error";
    }
}

/** Registry of integrator tool handlers, keyed by tool name. */
export class ToolRegistry {
    private readonly handlers = new Map<string, ToolHandler>();
    /** Notified whenever the set of registered tool names changes. */
    private onChange?: (names: string[]) => void;

    /** Subscribe to registry changes (the bridge re-sends REGISTER_TOOLS). */
    setOnChange(cb: (names: string[]) => void): void {
        this.onChange = cb;
    }

    /** Register (or replace) the handler for a tool. */
    register(name: string, handler: ToolHandler): void {
        if (typeof name !== "string" || !name) {
            throw new Error("[wp-nova] registerToolHandler requires a tool name");
        }
        if (typeof handler !== "function") {
            throw new Error(`[wp-nova] handler for "${name}" must be a function`);
        }
        this.handlers.set(name, handler);
        this.onChange?.(this.names());
    }

    /** Remove a tool handler, if present. */
    unregister(name: string): void {
        if (this.handlers.delete(name)) {
            this.onChange?.(this.names());
        }
    }

    /** Sorted list of registered tool names (sent in REGISTER_TOOLS). */
    names(): string[] {
        return Array.from(this.handlers.keys()).sort();
    }

    /**
     * Run the registered handler for a client tool and return its result plus a
     * fresh post-action snapshot. Throws `NoHandlerError` when unregistered and
     * `HandlerThrewError` when the handler itself fails — both mapped to typed
     * error frames by the bridge. A `StaleHandleError` thrown by a handler is
     * re-thrown unchanged so the bridge emits `stale_handle`. `safeSelectors` is
     * the per-surface safe-value allowlist threaded into the post-action capture.
     */
    async run(call: ClientToolCall, safeSelectors: string[] = []): Promise<ClientToolResult> {
        const handler = this.handlers.get(call.name);
        if (!handler) {
            throw new NoHandlerError(call.name);
        }
        try {
            const result = await handler(call.args ?? {});
            return { result, snapshot: capturePageContext(safeSelectors) };
        } catch (cause) {
            if (cause instanceof StaleHandleError) throw cause;
            throw new HandlerThrewError(call.name, cause);
        }
    }
}
