import type { SdkConfig, ToolDefinition } from "@wp-nova/chat-sdk";
import { destroy, init, registerTool, release, retain, unregisterTool } from "@wp-nova/chat-sdk";
import { act, type ReactElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NovaChatProvider } from "./index";

// Faithful stand-in for the SDK singleton: retain/release drive a shared refcount
// and a single shared `<wp-nova-chat>` element, exactly like the real controller.
// This lets the wrapper tests prove one mount's teardown does NOT remove another
// mount's live element (R1), and count init/registerTool calls (R5/R20).
const h = vi.hoisted(() => ({
    ELEMENT_TAG: "wp-nova-chat",
    state: { refs: 0, teardownCount: 0 },
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

beforeEach(() => {
    vi.clearAllMocks();
    h.state.refs = 0;
    h.state.teardownCount = 0;
    document.body.innerHTML = "";
    triggerRerender = () => {};
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
