import assert from "node:assert/strict";
import test from "node:test";
import { __resetTokenCooldownForTests } from "../../auth/token.js";
import type { ResolvedConfig } from "../../config/config.js";
import {
    makeElement,
    resetElementTestGlobals,
    resolvedConfig,
    setupElementTests,
    teardownElementTests,
} from "./test-support.js";

test.before(setupElementTests);
test.after(teardownElementTests);
test.afterEach(resetElementTestGlobals);

test("unavailable token response is terminal and does not schedule a retry", async () => {
    const scheduledDelays: number[] = [];
    const element = makeElement() as {
        resolved: Record<string, unknown>;
        acquireToken: () => Promise<void>;
    };
    element.resolved = {
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        iframeOrigin: "https://chat.wp-nova.ai",
        iframeSrc: "https://chat.wp-nova.ai/embed/chat",
        title: "Assistant",
        accent: "#111",
        triggerColor: "#111111",
        triggerIconColor: "light",
        safeValueSelectors: [],
        voiceModeEnabled: false,
        protocolVersion: 1,
    };

    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => ({
            ok: true,
            json: async () => ({
                unavailable: true,
                email: "user@example.com",
                message: "No account",
            }),
        }),
    });
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: (callback: () => void, ms?: number) => {
            scheduledDelays.push(Number(ms ?? 0));
            callback();
            return 1;
        },
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });

    await element.acquireToken();

    assert.deepEqual(scheduledDelays, []);
});

test("token transport errors schedule a cooldown retry", async () => {
    __resetTokenCooldownForTests();
    const scheduledDelays: number[] = [];
    const element = makeElement() as {
        resolved: Record<string, unknown>;
        acquireToken: () => Promise<void>;
    };
    element.resolved = {
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        iframeOrigin: "https://chat.wp-nova.ai",
        iframeSrc: "https://chat.wp-nova.ai/embed/chat",
        title: "Assistant",
        accent: "#111",
        triggerColor: "#111111",
        triggerIconColor: "light",
        safeValueSelectors: [],
        voiceModeEnabled: false,
        protocolVersion: 1,
    };

    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => ({
            ok: false,
            status: 503,
            json: async () => ({}),
        }),
    });
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: (callback: () => void, ms?: number) => {
            const delay = Number(ms ?? 0);
            scheduledDelays.push(delay);
            if (delay < 30_000) {
                queueMicrotask(callback);
            }
            return 1;
        },
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });

    try {
        await element.acquireToken();

        assert.deepEqual(scheduledDelays, [500, 1000, 30_000]);
    } finally {
        __resetTokenCooldownForTests();
    }
});

test("token transport errors are forwarded to a ready iframe", async () => {
    __resetTokenCooldownForTests();
    const sentErrors: string[] = [];
    const element = makeElement() as {
        resolved: Record<string, unknown>;
        iframeReady: boolean;
        bridge?: {
            sendAuthError: (message: string) => void;
        };
        acquireToken: () => Promise<void>;
    };
    element.resolved = {
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        iframeOrigin: "https://chat.wp-nova.ai",
        iframeSrc: "https://chat.wp-nova.ai/embed/chat",
        title: "Assistant",
        accent: "#111",
        triggerColor: "#111111",
        triggerIconColor: "light",
        safeValueSelectors: [],
        voiceModeEnabled: false,
        protocolVersion: 1,
    };
    element.iframeReady = true;
    element.bridge = {
        sendAuthError: (message) => {
            sentErrors.push(message);
        },
    };

    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => ({
            ok: false,
            status: 401,
            json: async () => ({}),
        }),
    });

    try {
        await element.acquireToken();

        assert.deepEqual(sentErrors, ["token endpoint returned 401"]);
    } finally {
        __resetTokenCooldownForTests();
    }
});

test("stale token responses after frame reset are ignored", async () => {
    let resolveFetch: (response: unknown) => void = () => undefined;
    const sentTokens: string[] = [];
    const element = makeElement() as {
        resolved: ResolvedConfig;
        iframeReady: boolean;
        bridge?: {
            sendAuthToken: (token: string) => void;
            stop: () => void;
        };
        lastAuth?: unknown;
        acquireToken: () => Promise<void>;
        resetFrame: () => void;
    };
    element.resolved = resolvedConfig();
    element.iframeReady = true;
    element.bridge = {
        sendAuthToken: (token: string) => {
            sentTokens.push(token);
        },
        stop: () => undefined,
    };

    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: () =>
            new Promise((resolve) => {
                resolveFetch = resolve;
            }),
    });

    const pending = element.acquireToken();
    element.resetFrame();
    resolveFetch({
        ok: true,
        json: async () => ({ access_token: "old-token", expires_in: 60 }),
    });
    await pending;

    assert.deepEqual(sentTokens, []);
    assert.equal(element.lastAuth, undefined);
});
