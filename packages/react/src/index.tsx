import type { SdkConfig, ToolDefinition, ToolHandler } from "@wp-nova/sdk";
import {
    createContext,
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
    destroy: () => Promise<void>;
}

const NovaChatContext = createContext<NovaChatApi | null>(null);

async function loadSdk(): Promise<SdkModule> {
    return import("@wp-nova/sdk");
}

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

export function NovaChatProvider({
    children,
    config,
    enabled = true,
    tools,
}: NovaChatProviderProps) {
    const api = useSdkApi();
    const wasEnabled = useRef(false);
    const lastDisabledMessage = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled) {
            const message = disabledConfigMessage(config);
            if (message && lastDisabledMessage.current !== message) {
                lastDisabledMessage.current = message;
                console.error(message);
            }
            if (wasEnabled.current) {
                wasEnabled.current = false;
                void api.destroy().catch((error) => reportOperationError("destroy", error));
            }
            return;
        }
        lastDisabledMessage.current = null;
        wasEnabled.current = true;
        void api.init(config).catch((error) => reportOperationError("init", error));
    }, [api, config, enabled]);

    useEffect(
        () => () => {
            if (wasEnabled.current) {
                wasEnabled.current = false;
                void api.destroy().catch((error) => reportOperationError("destroy", error));
            }
        },
        [api],
    );

    useEffect(() => {
        if (!enabled || !tools) return;
        const names = toolNames(tools);
        for (const tool of tools) {
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
    }, [api, enabled, tools]);

    return <NovaChatContext.Provider value={api}>{children}</NovaChatContext.Provider>;
}

export function NovaChat({ enabled, tools, ...config }: NovaChatProps) {
    return <NovaChatProvider config={config} enabled={enabled} tools={tools} />;
}

export function useNovaChat(): NovaChatApi {
    const context = useContext(NovaChatContext);
    const fallback = useSdkApi();
    return context ?? fallback;
}

export function useNovaTool(tool: NovaToolDefinition) {
    const api = useNovaChat();

    useEffect(() => {
        void api
            .registerTool(tool)
            .catch((error) => reportOperationError(`registerTool("${tool.name}")`, error));
        return () => {
            void api
                .unregisterTool(tool.name)
                .catch((error) => reportOperationError(`unregisterTool("${tool.name}")`, error));
        };
    }, [api, tool]);
}

export type { SdkConfig, ToolDefinition, ToolHandler } from "@wp-nova/sdk";
