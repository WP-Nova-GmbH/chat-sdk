import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedConfig } from "../../config/config.js";
import type { EmbedFrame, SdkFrame } from "../types/index.js";
import { EMBED_SOURCE, SDK_SOURCE } from "../types/index.js";
import { Bridge } from "./index.js";
import { restoreWindow } from "./test-support.js";

test("UNAVAILABLE preserves access-request capability fields", () => {
    const posted: SdkFrame[] = [];
    const iframeWindow = {
        postMessage(frame: SdkFrame) {
            posted.push(frame);
        },
    } as unknown as Window;
    const bridge = new Bridge(
        { iframeOrigin: "https://chat.example", protocolVersion: 2 } as ResolvedConfig,
        {
            onSnapshotRequest: () => ({ url: "https://host.example" }),
            onClientToolRequest: async () => ({}),
            onAuthExpired: () => undefined,
            onReady: () => undefined,
        },
    );

    bridge.setIframeWindow(iframeWindow);
    bridge.sendUnavailable("missing@example.com", "No account", "capability", 3600, false);

    assert.deepEqual(posted, [
        {
            source: SDK_SOURCE,
            protocolVersion: 2,
            type: "UNAVAILABLE",
            email: "missing@example.com",
            message: "No account",
            messageIsCustom: false,
            accessRequestToken: "capability",
            accessRequestExpiresIn: 3600,
        },
    ]);
});

test("HOST_THEME sends the host color mode to the validated iframe origin", () => {
    const posted: Array<{ frame: SdkFrame; origin: string }> = [];
    const iframeWindow = {
        postMessage(frame: SdkFrame, origin: string) {
            posted.push({ frame, origin });
        },
    } as unknown as Window;
    const bridge = new Bridge(
        { iframeOrigin: "https://chat.example", protocolVersion: 2 } as ResolvedConfig,
        {
            onSnapshotRequest: () => ({ url: "https://host.example" }),
            onClientToolRequest: async () => ({}),
            onAuthExpired: () => undefined,
            onReady: () => undefined,
        },
    );

    bridge.setIframeWindow(iframeWindow);
    bridge.sendHostTheme("dark");

    assert.deepEqual(posted, [
        {
            frame: {
                source: SDK_SOURCE,
                protocolVersion: 2,
                type: "HOST_THEME",
                theme: "dark",
            },
            origin: "https://chat.example",
        },
    ]);
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
