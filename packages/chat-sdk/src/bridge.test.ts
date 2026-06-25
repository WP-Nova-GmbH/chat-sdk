import assert from "node:assert/strict";
import test from "node:test";
import { Bridge } from "./bridge.js";
import type { ResolvedConfig } from "./config.js";
import type { EmbedFrame, SdkFrame } from "./types.js";
import { EMBED_SOURCE, SDK_SOURCE } from "./types.js";

const ORIGINAL_WINDOW = Object.getOwnPropertyDescriptor(globalThis, "window");

function restoreWindow(): void {
    if (ORIGINAL_WINDOW) {
        Object.defineProperty(globalThis, "window", ORIGINAL_WINDOW);
    } else {
        Reflect.deleteProperty(globalThis, "window");
    }
}

test("client tool errors include a best-effort recovery snapshot", async () => {
    let listener: ((event: MessageEvent) => void) | undefined;
    const posted: Array<{ frame: SdkFrame; origin: string }> = [];
    const iframeWindow = {
        postMessage(frame: SdkFrame, origin: string) {
            posted.push({ frame, origin });
        },
    } as unknown as Window;

    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            addEventListener(_type: string, cb: (event: MessageEvent) => void) {
                listener = cb;
            },
            removeEventListener() {
                listener = undefined;
            },
        },
    });

    const config = {
        iframeOrigin: "https://chat.example",
        protocolVersion: 1,
    } as ResolvedConfig;
    const bridge = new Bridge(config, {
        onSnapshotRequest: () => ({
            url: "https://host.example/customers",
            snapshot: { links: [{ handle: "h2", label: "Acme", href: "/customers/cus-001" }] },
        }),
        onClientToolRequest: async () => {
            throw { code: "stale_handle", message: "stale element handle: h1" };
        },
        onAuthExpired: () => undefined,
        onReady: () => undefined,
    });

    try {
        bridge.setIframeWindow(iframeWindow);
        bridge.start();

        listener?.({
            origin: "https://chat.example",
            source: iframeWindow,
            data: {
                source: EMBED_SOURCE,
                protocolVersion: 1,
                type: "READY",
                minProtocolVersion: 1,
                maxProtocolVersion: 1,
            } satisfies EmbedFrame,
        } as MessageEvent);
        listener?.({
            origin: "https://chat.example",
            source: iframeWindow,
            data: {
                source: EMBED_SOURCE,
                protocolVersion: 1,
                type: "CLIENT_TOOL_REQUEST",
                correlationId: "tool-1",
                call: { name: "open_record", args: { handle: "h1" } },
            } satisfies EmbedFrame,
        } as MessageEvent);

        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(posted.length, 1);
        const [message] = posted;
        assert.ok(message);
        assert.equal(message.origin, "https://chat.example");
        assert.deepEqual(message.frame, {
            source: SDK_SOURCE,
            protocolVersion: 1,
            type: "CLIENT_TOOL_ERROR",
            correlationId: "tool-1",
            code: "stale_handle",
            message: "stale element handle: h1",
            snapshot: {
                url: "https://host.example/customers",
                snapshot: {
                    links: [{ handle: "h2", label: "Acme", href: "/customers/cus-001" }],
                },
            },
        });
    } finally {
        bridge.stop();
        restoreWindow();
    }
});

test("incompatible READY prevents later client tool execution", async () => {
    let listener: ((event: MessageEvent) => void) | undefined;
    const posted: Array<{ frame: SdkFrame; origin: string }> = [];
    let toolRuns = 0;
    const iframeWindow = {
        postMessage(frame: SdkFrame, origin: string) {
            posted.push({ frame, origin });
        },
    } as unknown as Window;

    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            addEventListener(_type: string, cb: (event: MessageEvent) => void) {
                listener = cb;
            },
            removeEventListener() {
                listener = undefined;
            },
        },
    });

    const bridge = new Bridge(
        {
            iframeOrigin: "https://chat.example",
            protocolVersion: 2,
        } as ResolvedConfig,
        {
            onSnapshotRequest: () => ({ url: "https://host.example" }),
            onClientToolRequest: async () => {
                toolRuns++;
                return { result: { ok: true } };
            },
            onAuthExpired: () => undefined,
            onReady: () => false,
        },
    );

    try {
        bridge.setIframeWindow(iframeWindow);
        bridge.start();

        listener?.({
            origin: "https://chat.example",
            source: iframeWindow,
            data: {
                source: EMBED_SOURCE,
                protocolVersion: 1,
                type: "READY",
                minProtocolVersion: 1,
                maxProtocolVersion: 1,
            } satisfies EmbedFrame,
        } as MessageEvent);
        listener?.({
            origin: "https://chat.example",
            source: iframeWindow,
            data: {
                source: EMBED_SOURCE,
                protocolVersion: 1,
                type: "CLIENT_TOOL_REQUEST",
                correlationId: "tool-1",
                call: { name: "create_ticket", args: {} },
            } satisfies EmbedFrame,
        } as MessageEvent);

        await new Promise((resolve) => setTimeout(resolve, 0));

        assert.equal(toolRuns, 0);
        assert.deepEqual(posted, []);
    } finally {
        bridge.stop();
        restoreWindow();
    }
});
