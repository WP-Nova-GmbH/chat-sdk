// Integrator tool registry.
//
// SDK-declared tools are the single source of truth for what the agent CAN call:
// the host registers name, description, JSON Schema, mutation metadata, and the
// execution handler together via `WpNova("registerTool", definition)`.
//
// `registerToolHandler` remains as execution-only compatibility for legacy
// integrations, but handler-only names are not advertised to the iframe/model.
//
// Timing contract (WS6):
//   - The registry is populatable BEFORE or AFTER init (the queued snippet
//     buffers `registerTool` calls made before init).
//   - `REGISTER_TOOLS` is sent on `READY` and re-sent whenever the advertised
//     tool set changes.

import { isNavigationAction, StaleHandleError } from "./navigation.js";
import { capturePageContext } from "./snapshot.js";
import type {
    ClientToolCall,
    ClientToolResult,
    ClientToolSpec,
    ToolDefinition,
    ToolHandler,
} from "./types.js";

const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const MIN_DESCRIPTION_LENGTH = 20;

interface ToolRegistryEntry {
    spec: ClientToolSpec;
    handler: ToolHandler;
}

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

/** Registry of SDK-declared tools and legacy execution-only handlers. */
export class ToolRegistry {
    private readonly tools = new Map<string, ToolRegistryEntry>();
    private readonly legacyHandlers = new Map<string, ToolHandler>();
    /** Notified whenever the set of advertised tools changes. */
    private onChange?: (tools: ClientToolSpec[]) => void;

    /** Subscribe to registry changes (the bridge re-sends REGISTER_TOOLS). */
    setOnChange(cb: (tools: ClientToolSpec[]) => void): void {
        this.onChange = cb;
    }

    /** Register (or replace) a model-callable SDK tool. */
    register(tool: ToolDefinition): void {
        const entry = normalizeToolDefinition(tool);
        this.tools.set(entry.spec.name, entry);
        this.onChange?.(this.advertisedTools());
    }

    /** Remove a model-callable SDK tool, if present. */
    unregister(name: string): void {
        if (this.tools.delete(name)) {
            this.onChange?.(this.advertisedTools());
        }
    }

    /**
     * Legacy compatibility: register an execution-only handler. These handlers
     * can satisfy a CLIENT_TOOL_REQUEST but are not advertised in REGISTER_TOOLS.
     */
    registerHandler(name: string, handler: ToolHandler): void {
        if (typeof name !== "string" || !name) {
            throw new Error("[wp-nova] registerToolHandler requires a tool name");
        }
        if (typeof handler !== "function") {
            throw new Error(`[wp-nova] handler for "${name}" must be a function`);
        }
        this.legacyHandlers.set(name, handler);
    }

    /** Remove a legacy execution-only handler, if present. */
    unregisterHandler(name: string): void {
        this.legacyHandlers.delete(name);
    }

    /** Sorted list of SDK-declared tools (sent in REGISTER_TOOLS). */
    advertisedTools(): ClientToolSpec[] {
        return Array.from(this.tools.values())
            .map((entry) => entry.spec)
            .sort((a, b) => a.name.localeCompare(b.name));
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
        const handler = this.tools.get(call.name)?.handler ?? this.legacyHandlers.get(call.name);
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

function normalizeToolDefinition(tool: ToolDefinition): ToolRegistryEntry {
    if (!tool || typeof tool !== "object") {
        throw new Error("[wp-nova] registerTool requires a tool definition");
    }

    const name = typeof tool.name === "string" ? tool.name.trim() : "";
    if (!TOOL_NAME_PATTERN.test(name)) {
        throw new Error(
            "[wp-nova] registerTool requires `name` to start with a lowercase letter and use only lowercase letters, numbers, and underscores",
        );
    }
    if (isNavigationAction(name)) {
        throw new Error(`[wp-nova] "${name}" is reserved for a built-in page action`);
    }

    const description = typeof tool.description === "string" ? tool.description.trim() : "";
    if (description.length < MIN_DESCRIPTION_LENGTH) {
        throw new Error(
            `[wp-nova] registerTool description for "${name}" must be at least ${MIN_DESCRIPTION_LENGTH} characters`,
        );
    }

    if (!isPlainObject(tool.inputSchema)) {
        throw new Error(`[wp-nova] registerTool inputSchema for "${name}" must be an object`);
    }
    if (typeof tool.mutating !== "boolean") {
        throw new Error(`[wp-nova] registerTool mutating for "${name}" must be true or false`);
    }
    if (typeof tool.handler !== "function") {
        throw new Error(`[wp-nova] registerTool handler for "${name}" must be a function`);
    }

    const confirmationCopy =
        typeof tool.confirmationCopy === "string" ? tool.confirmationCopy.trim() : undefined;
    if (tool.mutating && !confirmationCopy) {
        throw new Error(
            `[wp-nova] registerTool confirmationCopy for "${name}" is required when mutating is true`,
        );
    }

    return {
        spec: {
            name,
            description,
            args_schema: tool.inputSchema,
            mutating: tool.mutating,
            ...(confirmationCopy ? { confirmationCopy } : {}),
        },
        handler: tool.handler,
    };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
