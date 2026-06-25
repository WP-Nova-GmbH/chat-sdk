import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedConfig } from "./config.js";
import { __resetTokenCooldownForTests, fetchToken } from "./token.js";

const ORIGINALS = {
    AbortSignal: Object.getOwnPropertyDescriptor(globalThis, "AbortSignal"),
    fetch: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
    setTimeout: Object.getOwnPropertyDescriptor(globalThis, "setTimeout"),
    clearTimeout: Object.getOwnPropertyDescriptor(globalThis, "clearTimeout"),
};

function restoreGlobals(): void {
    for (const [key, descriptor] of Object.entries(ORIGINALS)) {
        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    }
}

const CONFIG = {
    publicSurfaceId: "surf_1",
    tokenEndpoint: "/token",
    baseUrl: "https://chat.wp-nova.ai",
    iframeOrigin: "https://chat.wp-nova.ai",
    iframeSrc: "https://chat.wp-nova.ai/embed/chat?surface=surf_1",
    title: "Assistant",
    accent: "#8665e3",
    triggerColor: "#8665e3",
    triggerIconColor: "light",
    hasFirstPaintLauncherColor: true,
    safeValueSelectors: [],
    voiceModeEnabled: false,
    protocolVersion: 1,
} satisfies ResolvedConfig;

test("token fetch timeout returns a typed transport error", async () => {
    __resetTokenCooldownForTests();
    const NativeAbortController = AbortController;
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { origin: "https://app.example" },
    });
    Object.defineProperty(globalThis, "AbortSignal", {
        configurable: true,
        value: {
            timeout: () => {
                const controller = new NativeAbortController();
                controller.abort();
                return controller.signal;
            },
        },
    });
    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async (_url: string, init?: RequestInit) => {
            if (init?.signal?.aborted) {
                const error = new Error("aborted");
                error.name = "AbortError";
                throw error;
            }
            throw new Error("expected an aborted signal");
        },
    });
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: (callback: () => void, _ms?: number) => {
            callback();
            return 1;
        },
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });

    try {
        const result = await fetchToken(CONFIG);

        assert.equal(result.kind, "error");
        assert.equal(result.message, "token endpoint timed out after 15000ms");
    } finally {
        __resetTokenCooldownForTests();
        restoreGlobals();
    }
});

function installGrantGlobals(body: Record<string, unknown>): void {
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { origin: "https://app.example" },
    });
    Object.defineProperty(globalThis, "AbortSignal", {
        configurable: true,
        value: { timeout: () => new AbortController().signal },
    });
    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => ({ ok: true, status: 200, json: async () => body }),
    });
}

test("a development surface grant carries the development-mode flag", async () => {
    __resetTokenCooldownForTests();
    installGrantGlobals({ access_token: "tok", expires_in: 900, developmentMode: true });

    try {
        const result = await fetchToken(CONFIG);

        assert.equal(result.kind, "granted");
        assert.equal(result.kind === "granted" && result.developmentMode, true);
    } finally {
        __resetTokenCooldownForTests();
        restoreGlobals();
    }
});

test("a production surface grant does not flag development mode", async () => {
    __resetTokenCooldownForTests();
    installGrantGlobals({ access_token: "tok", expires_in: 900 });

    try {
        const result = await fetchToken(CONFIG);

        assert.equal(result.kind, "granted");
        assert.equal(result.kind === "granted" && result.developmentMode === true, false);
    } finally {
        __resetTokenCooldownForTests();
        restoreGlobals();
    }
});
