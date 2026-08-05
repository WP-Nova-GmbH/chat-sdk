import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedConfig } from "../../config/config.js";
import type { EmbedFrame, SdkFrame } from "../types/index.js";
import { EMBED_SOURCE, SDK_SOURCE } from "../types/index.js";
import { Bridge } from "./index.js";
import { restoreWindow } from "./test-support.js";

test("UNAVAILABLE preserves confirmation capability fields", () => {
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
    bridge.sendUnavailable(
        "missing@example.com",
        "No account",
        "request-capability",
        3600,
        false,
        true,
        "creation-capability",
        1800,
    );

    assert.deepEqual(posted, [
        {
            source: SDK_SOURCE,
            protocolVersion: 2,
            type: "UNAVAILABLE",
            email: "missing@example.com",
            message: "No account",
            messageIsCustom: false,
            accessRequestToken: "request-capability",
            accessRequestExpiresIn: 3600,
            userCreationRequired: true,
            userCreationToken: "creation-capability",
            userCreationExpiresIn: 1800,
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

test("page workflow frames preserve the additive protocol-v2 contract", () => {
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
    bridge.sendHostOpenState(true);
    bridge.sendStartPageWorkflow(
        "workflow-1",
        {
            id: "summarize-intervention",
            path: "/call-center/interventions/:interventionId",
            prompt: "Summarize the call",
            execution: { mode: "research-and-compose" },
        },
        "https://host.example/call-center/interventions/abc",
    );
    bridge.sendCancelPageWorkflow("workflow-1");

    assert.deepEqual(posted, [
        {
            source: SDK_SOURCE,
            protocolVersion: 2,
            type: "HOST_OPEN_STATE",
            open: true,
        },
        {
            source: SDK_SOURCE,
            protocolVersion: 2,
            type: "START_PAGE_WORKFLOW",
            correlationId: "workflow-1",
            workflow: {
                id: "summarize-intervention",
                path: "/call-center/interventions/:interventionId",
                prompt: "Summarize the call",
                execution: { mode: "research-and-compose" },
            },
            expectedUrl: "https://host.example/call-center/interventions/abc",
        },
        {
            source: SDK_SOURCE,
            protocolVersion: 2,
            type: "CANCEL_PAGE_WORKFLOW",
            correlationId: "workflow-1",
        },
    ]);
});

test("workflow snapshot correlation reaches the capture policy", () => {
    let listener: ((event: MessageEvent) => void) | undefined;
    const workflowCorrelations: Array<string | undefined> = [];
    const iframeWindow = { postMessage() {} } as unknown as Window;
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            addEventListener(_type: string, callback: (event: MessageEvent) => void) {
                listener = callback;
            },
            removeEventListener() {
                listener = undefined;
            },
        },
    });
    const bridge = new Bridge(
        { iframeOrigin: "https://chat.example", protocolVersion: 2 } as ResolvedConfig,
        {
            onSnapshotRequest: (workflowCorrelationId) => {
                workflowCorrelations.push(workflowCorrelationId);
                return { url: "https://host.example" };
            },
            onClientToolRequest: async () => ({}),
            onAuthExpired: () => undefined,
            onReady: () => undefined,
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
                protocolVersion: 2,
                type: "READY",
                minProtocolVersion: 2,
                maxProtocolVersion: 2,
            } satisfies EmbedFrame,
        } as MessageEvent);
        listener?.({
            origin: "https://chat.example",
            source: iframeWindow,
            data: {
                source: EMBED_SOURCE,
                protocolVersion: 2,
                type: "REQUEST_SNAPSHOT",
                correlationId: "snapshot-1",
                workflowCorrelationId: "workflow-1",
            } satisfies EmbedFrame,
        } as MessageEvent);

        assert.deepEqual(workflowCorrelations, ["workflow-1"]);
    } finally {
        bridge.stop();
        restoreWindow();
    }
});

test("READY capabilities and page workflow statuses reach bridge handlers", () => {
    let listener: ((event: MessageEvent) => void) | undefined;
    let capabilities: readonly string[] | undefined;
    const statuses: unknown[] = [];
    const iframeWindow = { postMessage() {} } as unknown as Window;
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            addEventListener(_type: string, callback: (event: MessageEvent) => void) {
                listener = callback;
            },
            removeEventListener() {
                listener = undefined;
            },
        },
    });
    const bridge = new Bridge(
        { iframeOrigin: "https://chat.example", protocolVersion: 2 } as ResolvedConfig,
        {
            onSnapshotRequest: () => ({ url: "https://host.example" }),
            onClientToolRequest: async () => ({}),
            onAuthExpired: () => undefined,
            onReady: (_min, _max, nextCapabilities) => {
                capabilities = nextCapabilities;
                return undefined;
            },
            onPageWorkflowStatus: (status) => statuses.push(status),
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
                protocolVersion: 2,
                type: "READY",
                minProtocolVersion: 2,
                maxProtocolVersion: 2,
                capabilities: ["page-workflows"],
            } satisfies EmbedFrame,
        } as MessageEvent);
        listener?.({
            origin: "https://chat.example",
            source: iframeWindow,
            data: {
                source: EMBED_SOURCE,
                protocolVersion: 2,
                type: "PAGE_WORKFLOW_STATUS",
                correlationId: "workflow-1",
                status: "cached",
                resultId: "result-1",
            } satisfies EmbedFrame,
        } as MessageEvent);

        assert.deepEqual(capabilities, ["page-workflows"]);
        assert.deepEqual(statuses, [
            {
                correlationId: "workflow-1",
                status: "cached",
                resultId: "result-1",
                message: undefined,
            },
        ]);
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
