import type { SdkConfig, ToolHandler } from "@wp-nova/sdk";
import {
    createContext,
    type PropsWithChildren,
    useContext,
    useEffect,
    useMemo,
    useRef,
} from "react";

type SdkModule = typeof import("@wp-nova/sdk");

export type NovaToolMap = Record<string, ToolHandler>;

export interface NovaChatProviderProps extends PropsWithChildren {
    config: SdkConfig;
    enabled?: boolean;
    tools?: NovaToolMap;
}

export interface NovaChatProps extends SdkConfig {
    enabled?: boolean;
    tools?: NovaToolMap;
}

export interface NovaChatApi {
    init: (config: SdkConfig) => Promise<void>;
    registerToolHandler: (name: string, handler: ToolHandler) => Promise<void>;
    unregisterToolHandler: (name: string) => Promise<void>;
    destroy: () => Promise<void>;
}

const NovaChatContext = createContext<NovaChatApi | null>(null);

async function loadSdk(): Promise<SdkModule> {
    return import("@wp-nova/sdk");
}

function useSdkApi(): NovaChatApi {
    return useMemo(
        () => ({
            async init(config) {
                const sdk = await loadSdk();
                sdk.init(config);
            },
            async registerToolHandler(name, handler) {
                const sdk = await loadSdk();
                sdk.registerToolHandler(name, handler);
            },
            async unregisterToolHandler(name) {
                const sdk = await loadSdk();
                sdk.unregisterToolHandler(name);
            },
            async destroy() {
                const sdk = await loadSdk();
                sdk.destroy();
            },
        }),
        [],
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

    useEffect(() => {
        if (!enabled) {
            if (wasEnabled.current) {
                wasEnabled.current = false;
                void api.destroy();
            }
            return;
        }
        wasEnabled.current = true;
        void api.init(config);
    }, [api, config, enabled]);

    useEffect(
        () => () => {
            if (wasEnabled.current) {
                wasEnabled.current = false;
                void api.destroy();
            }
        },
        [api],
    );

    useEffect(() => {
        if (!enabled || !tools) return;
        const names = Object.keys(tools);
        for (const name of names) {
            const handler = tools[name];
            if (handler) void api.registerToolHandler(name, handler);
        }
        return () => {
            for (const name of names) void api.unregisterToolHandler(name);
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

export function useNovaTool(name: string, handler: ToolHandler) {
    const api = useNovaChat();

    useEffect(() => {
        void api.registerToolHandler(name, handler);
        return () => {
            void api.unregisterToolHandler(name);
        };
    }, [api, handler, name]);
}

export type { SdkConfig, ToolHandler } from "@wp-nova/sdk";
