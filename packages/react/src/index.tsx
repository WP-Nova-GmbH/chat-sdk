import type { SdkConfig, ToolDefinition, ToolHandler } from "@wp-nova/sdk";
import {
    createContext,
    memo,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
} from "react";

type SdkModule = typeof import("@wp-nova/sdk");

export type NovaToolDefinition = ToolDefinition;

export interface NovaChatProviderProps extends PropsWithChildren {
    config: SdkConfig;
    enabled?: boolean;
    tools?: readonly NovaToolDefinition[];
}

export interface NovaChatProps extends SdkConfig {
    enabled?: boolean;
    tools?: readonly NovaToolDefinition[];
}

export interface NovaChatApi {
    init: (config: SdkConfig) => Promise<void>;
    registerTool: (tool: NovaToolDefinition) => Promise<void>;
    unregisterTool: (name: string) => Promise<void>;
    /** @deprecated Use registerTool with the full tool definition. */
    registerToolHandler: (name: string, handler: ToolHandler) => Promise<void>;
    /** @deprecated Use unregisterTool for SDK-declared tools. */
    unregisterToolHandler: (name: string) => Promise<void>;
    /** Register a live mount of the shared chat element. Pairs with `release`. */
    retain: () => Promise<void>;
    /** Drop a live mount; the shared element tears down only at the last release. */
    release: () => Promise<void>;
    destroy: () => Promise<void>;
}

const NovaChatContext = createContext<NovaChatApi | null>(null);

async function loadSdk(): Promise<SdkModule> {
    return import("@wp-nova/sdk");
}

// NOTE (A8): the core now exports `missingRequiredConfigFields`,
// `formatErrorMessage`, `buildDisabledMessage` and `reportOperationError`. They are
// NOT consumed here because a static import of `@wp-nova/sdk` pulls the core
// package root, which eagerly evaluates `class extends HTMLElement` and throws
// under Next.js / Node SSR (the wrapper deliberately reaches the core only via a
// runtime dynamic import). These copies stay SSR-safe until the core exposes the
// diagnostics on an SSR-safe subpath (e.g. `@wp-nova/sdk/diagnostics`).
function formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function reportOperationError(operation: string, error: unknown): void {
    const message = formatErrorMessage(error);
    if (message.startsWith("[wp-nova]")) return;
    console.error(`[wp-nova/react] ${operation} failed: ${message}`);
}

function missingRequiredConfigFields(config: SdkConfig): string[] {
    const missing: string[] = [];
    if (!config.publicSurfaceId?.trim()) missing.push("publicSurfaceId");
    if (!config.tokenEndpoint?.trim()) missing.push("tokenEndpoint");
    return missing;
}

function disabledConfigMessage(config: SdkConfig): string | null {
    const missing = missingRequiredConfigFields(config);
    if (missing.length === 0) return null;
    return (
        "[wp-nova/react] NovaChatProvider did not mount the chat launcher because " +
        `enabled=false and required config is missing: ${missing.join(", ")}.`
    );
}

function useSdkApi(): NovaChatApi {
    const operationQueue = useRef<Promise<void>>(Promise.resolve());
    const runQueued = useCallback((operation: (sdk: SdkModule) => void) => {
        const next = operationQueue.current.then(async () => {
            const sdk = await loadSdk();
            operation(sdk);
        });
        operationQueue.current = next.catch(() => undefined);
        return next;
    }, []);

    return useMemo(
        () => ({
            init(config) {
                return runQueued((sdk) => sdk.init(config));
            },
            registerTool(tool) {
                return runQueued((sdk) => sdk.registerTool(tool));
            },
            unregisterTool(name) {
                return runQueued((sdk) => sdk.unregisterTool(name));
            },
            registerToolHandler(name, handler) {
                return runQueued((sdk) => sdk.registerToolHandler(name, handler));
            },
            unregisterToolHandler(name) {
                return runQueued((sdk) => sdk.unregisterToolHandler(name));
            },
            retain() {
                return runQueued((sdk) => sdk.retain());
            },
            release() {
                return runQueued((sdk) => sdk.release());
            },
            destroy() {
                return runQueued((sdk) => sdk.destroy());
            },
        }),
        [runQueued],
    );
}

function toolNames(tools: readonly NovaToolDefinition[]): string[] {
    return tools.map((tool) => tool.name);
}

/** Serialize the tool fields whose change must re-emit REGISTER_TOOLS. */
function toolsSignature(tools: readonly NovaToolDefinition[]): string {
    return JSON.stringify(
        tools.map((tool) => [
            tool.name,
            tool.description,
            tool.inputSchema,
            tool.mutating,
            tool.confirmationCopy,
        ]),
    );
}

export function NovaChatProvider({
    children,
    config,
    enabled = true,
    tools,
}: NovaChatProviderProps) {
    const api = useSdkApi();
    const wasEnabled = useRef(false);
    const lastDisabledMessage = useRef<string | null>(null);

    // Re-init only when a meaningful config field changes, not on every parent
    // render that rebuilds the config object (R5). `mount` is compared by
    // reference (it may be a live HTMLElement) instead of being serialized.
    const configKey = JSON.stringify([
        config.publicSurfaceId,
        config.tokenEndpoint,
        config.baseUrl,
        config.title,
        config.accent,
        config.triggerColor,
        config.triggerIconColor,
        config.safeValueSelectors,
        config.voiceMode,
        config.protocolVersion,
    ]);
    // Intentionally re-derive only on the primitive configKey + mount identity,
    // never on the per-render config object reference (that is the R5 bug).
    // biome-ignore lint/correctness/useExhaustiveDependencies: configKey + mount identity are the intended triggers, not the per-render config reference (R5).
    const stableConfig = useMemo(() => config, [configKey, config.mount]);

    useEffect(() => {
        if (!enabled) {
            const message = disabledConfigMessage(stableConfig);
            if (message && lastDisabledMessage.current !== message) {
                lastDisabledMessage.current = message;
                console.error(message);
            }
            if (wasEnabled.current) {
                wasEnabled.current = false;
                void api.release().catch((error) => reportOperationError("release", error));
            }
            return;
        }
        lastDisabledMessage.current = null;
        if (!wasEnabled.current) {
            wasEnabled.current = true;
            void api.retain().catch((error) => reportOperationError("retain", error));
        }
        void api.init(stableConfig).catch((error) => reportOperationError("init", error));
    }, [api, stableConfig, enabled]);

    useEffect(
        () => () => {
            if (wasEnabled.current) {
                wasEnabled.current = false;
                void api.release().catch((error) => reportOperationError("release", error));
            }
        },
        [api],
    );

    // Key the tools effect on serialized content (R20), not array identity, so an
    // inline `tools={[…]}` of unchanged content does not churn REGISTER_TOOLS.
    const toolsKey = useMemo(() => (tools ? toolsSignature(tools) : ""), [tools]);
    const toolsRef = useRef(tools);
    toolsRef.current = tools;

    // toolsKey (serialized content) is the intended trigger; the latest tools are
    // read from toolsRef so unchanged-content re-renders do not churn the registry.
    // biome-ignore lint/correctness/useExhaustiveDependencies: toolsKey is the intended trigger; the latest tools are read from toolsRef (R20).
    useEffect(() => {
        if (!enabled) return;
        const current = toolsRef.current;
        if (!current) return;
        const names = toolNames(current);
        for (const tool of current) {
            void api
                .registerTool(tool)
                .catch((error) => reportOperationError(`registerTool("${tool.name}")`, error));
        }
        return () => {
            for (const name of names) {
                void api
                    .unregisterTool(name)
                    .catch((error) => reportOperationError(`unregisterTool("${name}")`, error));
            }
        };
    }, [api, enabled, toolsKey]);

    return <NovaChatContext.Provider value={api}>{children}</NovaChatContext.Provider>;
}

export const NovaChat = memo(function NovaChat({ enabled, tools, ...config }: NovaChatProps) {
    return <NovaChatProvider config={config} enabled={enabled} tools={tools} />;
});

export function useNovaChat(): NovaChatApi {
    const context = useContext(NovaChatContext);
    const fallback = useSdkApi();
    return context ?? fallback;
}

export function useNovaTool(tool: NovaToolDefinition) {
    const api = useNovaChat();
    const toolKey = useMemo(() => toolsSignature([tool]), [tool]);
    const toolRef = useRef(tool);
    toolRef.current = tool;

    // toolKey (serialized content) is the intended trigger; the latest tool is
    // read from toolRef so unchanged-content re-renders do not re-register.
    // biome-ignore lint/correctness/useExhaustiveDependencies: toolKey is the intended trigger; the latest tool is read from toolRef (R20).
    useEffect(() => {
        const current = toolRef.current;
        void api
            .registerTool(current)
            .catch((error) => reportOperationError(`registerTool("${current.name}")`, error));
        return () => {
            void api
                .unregisterTool(current.name)
                .catch((error) => reportOperationError(`unregisterTool("${current.name}")`, error));
        };
    }, [api, toolKey]);
}

export type { SdkConfig, ToolDefinition, ToolHandler } from "@wp-nova/sdk";
