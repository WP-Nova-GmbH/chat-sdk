import type { SdkConfig, ToolDefinition } from "@wp-nova/chat-sdk";
import {
    close,
    destroy,
    init,
    registerTool,
    release,
    retain,
    setPageReady,
    toggle,
    unregisterTool,
} from "@wp-nova/chat-sdk";
import { act, type ReactElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NovaChatProvider, useNovaChat, useNovaChatOpenState } from "./index";

// Faithful stand-in for the SDK singleton: retain/release drive a shared refcount
// and a single shared `<wp-nova-chat>` element, exactly like the real controller.
// This lets the wrapper tests prove one mount's teardown does NOT remove another
// mount's live element (R1), and count init/registerTool calls (R5/R20).
const h = vi.hoisted(() => ({
    ELEMENT_TAG: "wp-nova-chat",
    openListeners: new Set<(open: boolean) => void>(),
    state: { open: false, refs: 0, teardownCount: 0 },
}));

vi.mock("@wp-nova/chat-sdk", () => {
    const ensureElement = () => {
        if (!document.querySelector(h.ELEMENT_TAG)) {
            document.body.appendChild(document.createElement(h.ELEMENT_TAG));
        }
    };
    const teardown = () => {
        const el = document.querySelector(h.ELEMENT_TAG);
        if (el) {
            el.remove();
            h.state.teardownCount++;
        }
        setOpen(false);
    };
    const setOpen = (open: boolean) => {
        if (h.state.open === open) return;
        h.state.open = open;
        for (const listener of h.openListeners) listener(open);
    };
    return {
        init: vi.fn(() => ensureElement()),
        registerTool: vi.fn(),
        unregisterTool: vi.fn(),
        registerToolHandler: vi.fn(),
        unregisterToolHandler: vi.fn(),
        retain: vi.fn(() => {
            h.state.refs++;
        }),
        release: vi.fn(() => {
            if (h.state.refs > 0) h.state.refs--;
            if (h.state.refs === 0) teardown();
        }),
        open: vi.fn(() => setOpen(true)),
        close: vi.fn(() => setOpen(false)),
        toggle: vi.fn(() => setOpen(!h.state.open)),
        isOpen: vi.fn(() => h.state.open),
        subscribeOpenChange: vi.fn((listener: (open: boolean) => void) => {
            h.openListeners.add(listener);
            return () => h.openListeners.delete(listener);
        }),
        setPageReady: vi.fn(),
        destroy: vi.fn(() => teardown()),
    };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const config: SdkConfig = { publicSurfaceId: "surface", tokenEndpoint: "/token" };

/** Drain the wrapper's queued dynamic-import operations and pending effects. */
async function flush(): Promise<void> {
    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
}

async function mount(ui: ReactElement): Promise<Root> {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(ui);
    });
    await flush();
    return root;
}

async function rerender(root: Root, ui: ReactElement): Promise<void> {
    await act(async () => {
        root.render(ui);
    });
    await flush();
}

async function unmount(root: Root): Promise<void> {
    await act(async () => {
        root.unmount();
    });
    await flush();
}

let triggerRerender: () => void = () => {};
let triggerChatToggle: () => Promise<void> = () => Promise.resolve();
let signalPageReady: (ready: boolean) => Promise<void> = () => Promise.resolve();

beforeEach(() => {
    vi.clearAllMocks();
    h.state.refs = 0;
    h.state.open = false;
    h.state.teardownCount = 0;
    h.openListeners.clear();
    document.body.innerHTML = "";
    triggerRerender = () => {};
    triggerChatToggle = () => Promise.resolve();
    signalPageReady = () => Promise.resolve();
});

describe("NovaChatProvider — R1 shared-singleton teardown", () => {
    it("keeps the shared element alive when one of two mounts unmounts", async () => {
        const first = await mount(<NovaChatProvider config={config}>a</NovaChatProvider>);
        const second = await mount(<NovaChatProvider config={config}>b</NovaChatProvider>);

        expect(retain).toHaveBeenCalledTimes(2);
        expect(h.state.refs).toBe(2);
        expect(document.querySelectorAll(h.ELEMENT_TAG)).toHaveLength(1);

        // Unmount the first instance: refcount drops to 1, the shared element (the
        // second instance's live chat) MUST survive and teardown must not run.
        await unmount(first);
        expect(release).toHaveBeenCalledTimes(1);
        expect(h.state.refs).toBe(1);
        expect(document.querySelectorAll(h.ELEMENT_TAG)).toHaveLength(1);
        expect(h.state.teardownCount).toBe(0);

        // Unmount the last instance: the element is removed exactly once.
        await unmount(second);
        expect(release).toHaveBeenCalledTimes(2);
        expect(h.state.refs).toBe(0);
        expect(document.querySelector(h.ELEMENT_TAG)).toBeNull();
        expect(h.state.teardownCount).toBe(1);
        expect(destroy).not.toHaveBeenCalled();
    });

    it("releases (not destroys) when disabled, preserving another mount", async () => {
        const first = await mount(<NovaChatProvider config={config}>a</NovaChatProvider>);
        const second = await mount(<NovaChatProvider config={config}>b</NovaChatProvider>);
        expect(document.querySelectorAll(h.ELEMENT_TAG)).toHaveLength(1);

        // Disable the first instance: it releases its mount, but the element lives.
        await rerender(
            first,
            <NovaChatProvider config={config} enabled={false}>
                a
            </NovaChatProvider>,
        );
        expect(release).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll(h.ELEMENT_TAG)).toHaveLength(1);
        expect(h.state.teardownCount).toBe(0);

        // The last live instance unmounts -> teardown runs exactly once.
        await unmount(second);
        expect(document.querySelector(h.ELEMENT_TAG)).toBeNull();
        expect(h.state.teardownCount).toBe(1);
    });
});

describe("NovaChatProvider — R5 stable config", () => {
    function ConfigParent(): ReactElement {
        const [, setTick] = useState(0);
        triggerRerender = () => setTick((tick) => tick + 1);
        // Inline config: a NEW object identity every render, identical content.
        const inlineConfig: SdkConfig = { publicSurfaceId: "surface", tokenEndpoint: "/token" };
        return <NovaChatProvider config={inlineConfig}>child</NovaChatProvider>;
    }

    it("does not re-init / refetch the token when the parent re-renders with unchanged config", async () => {
        await mount(<ConfigParent />);
        expect(init).toHaveBeenCalledTimes(1);
        expect(retain).toHaveBeenCalledTimes(1);

        for (let i = 0; i < 3; i++) {
            await act(async () => {
                triggerRerender();
            });
            await flush();
        }

        expect(init).toHaveBeenCalledTimes(1);
        expect(retain).toHaveBeenCalledTimes(1);
    });

    it("re-initializes in place when the host theme changes", async () => {
        const root = await mount(
            <NovaChatProvider config={{ ...config, theme: "light" }}>child</NovaChatProvider>,
        );
        expect(init).toHaveBeenCalledTimes(1);
        expect(retain).toHaveBeenCalledTimes(1);

        await rerender(
            root,
            <NovaChatProvider config={{ ...config, theme: "dark" }}>child</NovaChatProvider>,
        );

        expect(init).toHaveBeenCalledTimes(2);
        expect(init).toHaveBeenLastCalledWith({ ...config, theme: "dark" });
        expect(retain).toHaveBeenCalledTimes(1);
        expect(release).not.toHaveBeenCalled();
    });

    it("re-initializes in place when the host locale changes", async () => {
        const root = await mount(
            <NovaChatProvider config={{ ...config, locale: "en" }}>child</NovaChatProvider>,
        );
        expect(init).toHaveBeenCalledTimes(1);

        await rerender(
            root,
            <NovaChatProvider config={{ ...config, locale: "de" }}>child</NovaChatProvider>,
        );

        expect(init).toHaveBeenCalledTimes(2);
        expect(init).toHaveBeenLastCalledWith({ ...config, locale: "de" });
        expect(retain).toHaveBeenCalledTimes(1);
        expect(release).not.toHaveBeenCalled();
    });

    it("re-initializes in place when a theme-specific launcher color changes", async () => {
        const root = await mount(
            <NovaChatProvider config={{ ...config, theme: "dark", triggerColorDark: "#111111" }}>
                child
            </NovaChatProvider>,
        );
        expect(init).toHaveBeenCalledTimes(1);

        await rerender(
            root,
            <NovaChatProvider config={{ ...config, theme: "dark", triggerColorDark: "#222222" }}>
                child
            </NovaChatProvider>,
        );

        expect(init).toHaveBeenCalledTimes(2);
        expect(init).toHaveBeenLastCalledWith({
            ...config,
            theme: "dark",
            triggerColorDark: "#222222",
        });
        expect(retain).toHaveBeenCalledTimes(1);
        expect(release).not.toHaveBeenCalled();
    });

    it("re-initializes in place when presentation changes", async () => {
        const root = await mount(
            <NovaChatProvider config={{ ...config, presentation: { mode: "popover" } }}>
                child
            </NovaChatProvider>,
        );
        expect(init).toHaveBeenCalledTimes(1);

        await rerender(
            root,
            <NovaChatProvider
                config={{
                    ...config,
                    mount: "#nova-layout",
                    presentation: { mode: "sidebar", width: 480, resizable: true },
                }}
            >
                child
            </NovaChatProvider>,
        );

        expect(init).toHaveBeenCalledTimes(2);
        expect(init).toHaveBeenLastCalledWith({
            ...config,
            mount: "#nova-layout",
            presentation: { mode: "sidebar", width: 480, resizable: true },
        });
        expect(retain).toHaveBeenCalledTimes(1);
        expect(release).not.toHaveBeenCalled();
    });

    it("re-initializes in place when page workflow definitions change", async () => {
        const firstWorkflow = {
            id: "summary",
            path: "/interventions/:id",
            prompt: "Summarize the call",
            execution: { mode: "research-and-compose" as const },
        };
        const root = await mount(
            <NovaChatProvider config={{ ...config, pageWorkflows: [firstWorkflow] }}>
                child
            </NovaChatProvider>,
        );
        expect(init).toHaveBeenCalledTimes(1);

        const nextWorkflow = {
            ...firstWorkflow,
            prompt: "Summarize and recommend next actions",
            execution: { mode: "research-and-compose" as const },
        };
        await rerender(
            root,
            <NovaChatProvider config={{ ...config, pageWorkflows: [nextWorkflow] }}>
                child
            </NovaChatProvider>,
        );

        expect(init).toHaveBeenCalledTimes(2);
        expect(init).toHaveBeenLastCalledWith({
            ...config,
            pageWorkflows: [nextWorkflow],
        });
    });

    it("updates site capabilities only when provider identity or description changes", async () => {
        const firstProvider = () => ({ features: ["Search customers"] });
        const secondProvider = () => ({ features: ["Search customers", "Create tickets"] });
        const root = await mount(
            <NovaChatProvider
                config={{
                    ...config,
                    siteCapabilities: { provider: firstProvider },
                }}
            >
                child
            </NovaChatProvider>,
        );
        expect(init).toHaveBeenCalledTimes(1);

        // A fresh wrapper object with the same provider is semantically unchanged.
        await rerender(
            root,
            <NovaChatProvider
                config={{
                    ...config,
                    siteCapabilities: { provider: firstProvider },
                }}
            >
                child
            </NovaChatProvider>,
        );
        expect(init).toHaveBeenCalledTimes(1);

        await rerender(
            root,
            <NovaChatProvider
                config={{
                    ...config,
                    siteCapabilities: {
                        description:
                            "Always check the current Acme capabilities before describing them.",
                        provider: secondProvider,
                    },
                }}
            >
                child
            </NovaChatProvider>,
        );

        expect(init).toHaveBeenCalledTimes(2);
        expect(retain).toHaveBeenCalledTimes(1);
        expect(release).not.toHaveBeenCalled();
    });
});

describe("NovaChatProvider — R20 stable tools", () => {
    function ToolsParent(): ReactElement {
        const [, setTick] = useState(0);
        triggerRerender = () => setTick((tick) => tick + 1);
        // Inline tools: a NEW array + object identities every render, same content.
        const inlineTools: ToolDefinition[] = [
            {
                name: "alpha",
                description: "desc",
                inputSchema: {},
                mutating: false,
                handler: () => undefined,
            },
        ];
        return (
            <NovaChatProvider config={config} tools={inlineTools}>
                child
            </NovaChatProvider>
        );
    }

    it("does not churn REGISTER_TOOLS when re-rendered with unchanged tool content", async () => {
        await mount(<ToolsParent />);
        expect(registerTool).toHaveBeenCalledTimes(1);

        for (let i = 0; i < 3; i++) {
            await act(async () => {
                triggerRerender();
            });
            await flush();
        }

        expect(registerTool).toHaveBeenCalledTimes(1);
        expect(unregisterTool).not.toHaveBeenCalled();
    });
});

describe("host-owned chat controls", () => {
    function CustomTrigger(): ReactElement {
        const chat = useNovaChat();
        const open = useNovaChatOpenState();
        triggerChatToggle = chat.toggle;
        signalPageReady = chat.setPageReady;
        return (
            <button aria-expanded={open} onClick={() => void chat.toggle()} type="button">
                {open ? "Close assistant" : "Open assistant"}
            </button>
        );
    }

    it("toggles through the provider API and follows external close transitions", async () => {
        await mount(
            <NovaChatProvider config={{ ...config, launcher: false }}>
                <CustomTrigger />
            </NovaChatProvider>,
        );
        const button = document.querySelector("button");
        expect(button?.getAttribute("aria-expanded")).toBe("false");

        await act(async () => {
            await triggerChatToggle();
        });
        await flush();

        expect(toggle).toHaveBeenCalledTimes(1);
        expect(button?.getAttribute("aria-expanded")).toBe("true");
        expect(button?.textContent).toBe("Close assistant");

        await act(async () => {
            close();
        });

        expect(button?.getAttribute("aria-expanded")).toBe("false");
        expect(button?.textContent).toBe("Open assistant");
    });

    it("forwards explicit page readiness through the provider API", async () => {
        await mount(
            <NovaChatProvider config={config}>
                <CustomTrigger />
            </NovaChatProvider>,
        );

        await act(async () => {
            await signalPageReady(true);
            await signalPageReady(false);
        });

        expect(setPageReady).toHaveBeenNthCalledWith(1, true);
        expect(setPageReady).toHaveBeenNthCalledWith(2, false);
    });
});
