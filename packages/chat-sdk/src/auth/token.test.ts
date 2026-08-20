import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedConfig } from "../config/config.js";
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
    presentationMode: "popover",
    sidebarWidth: 384,
    sidebarResizable: false,
    title: "Assistant",
    accent: "#8665e3",
    triggerColor: "#8665e3",
    triggerIconColor: "light",
    launcherEnabled: true,
    theme: "light",
    hasFirstPaintLauncherColor: true,
    safeValueSelectors: [],
    voiceModeEnabled: false,
    uiDesign: "current" as const,
    siteRoutes: [],
    pageWorkflows: [],
    settle: { quietMs: 200, maxWaitMs: 1600 },
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

test("an explicit unavailable body survives a proxy-rewritten non-2xx status", async () => {
    __resetTokenCooldownForTests();
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
        value: async () => ({
            ok: false,
            status: 403,
            json: async () => ({
                unavailable: true,
                email: "missing@example.com",
                message: "No account",
                message_is_custom: false,
                access_request_token: "request-capability",
                access_request_expires_in: 3600,
                user_creation_required: true,
                user_creation_token: "creation-capability",
                user_creation_expires_in: 1800,
            }),
        }),
    });

    try {
        assert.deepEqual(await fetchToken(CONFIG), {
            kind: "unavailable",
            email: "missing@example.com",
            message: "No account",
            messageIsCustom: false,
            accessRequestToken: "request-capability",
            accessRequestExpiresIn: 3600,
            userCreationRequired: true,
            userCreationToken: "creation-capability",
            userCreationExpiresIn: 1800,
        });
    } finally {
        __resetTokenCooldownForTests();
        restoreGlobals();
    }
});

test("a non-2xx response without the unavailable discriminator remains an auth error", async () => {
    __resetTokenCooldownForTests();
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
        value: async () => ({
            ok: false,
            status: 403,
            json: async () => ({ message: "forbidden" }),
        }),
    });

    try {
        assert.deepEqual(await fetchToken(CONFIG), {
            kind: "error",
            message: "token endpoint returned 403",
        });
    } finally {
        __resetTokenCooldownForTests();
        restoreGlobals();
    }
});

test("malformed successful JSON remains a typed auth error", async () => {
    __resetTokenCooldownForTests();
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
        value: async () => ({
            ok: true,
            status: 200,
            json: async () => {
                throw new SyntaxError("invalid JSON");
            },
        }),
    });

    try {
        assert.deepEqual(await fetchToken(CONFIG), {
            kind: "error",
            message: "token endpoint returned malformed JSON",
        });
    } finally {
        __resetTokenCooldownForTests();
        restoreGlobals();
    }
});

test("token cooldown is keyed per endpoint and reset by clear()", async () => {
    __resetTokenCooldownForTests();
    const calls: string[] = [];
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
        value: async (url: string) => {
            calls.push(url);
            if (url === "/endpoint-a") return { ok: false, status: 503, json: async () => ({}) };
            return {
                ok: true,
                status: 200,
                json: async () => ({ access_token: "tok-b", expires_in: 900 }),
            };
        },
    });
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: (callback: () => void) => {
            callback();
            return 1;
        },
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });

    const configA = { ...CONFIG, tokenEndpoint: "/endpoint-a" } satisfies ResolvedConfig;
    const configB = { ...CONFIG, tokenEndpoint: "/endpoint-b" } satisfies ResolvedConfig;

    try {
        // Drive endpoint A into cooldown (exhaust retries on a 5xx).
        assert.equal((await fetchToken(configA)).kind, "error");

        // A short-circuits on cooldown without hitting the network again.
        calls.length = 0;
        const a2 = await fetchToken(configA);
        assert.equal(a2.kind, "error");
        assert.equal(a2.message, "token endpoint is in cooldown after repeated failures");
        assert.equal(calls.length, 0);

        // Endpoint B is unaffected by A's cooldown.
        const b = await fetchToken(configB);
        assert.equal(b.kind, "granted");
        assert.ok(calls.includes("/endpoint-b"));

        // clear() resets every endpoint's cooldown — A is reachable again.
        __resetTokenCooldownForTests();
        calls.length = 0;
        const a3 = await fetchToken(configA);
        assert.equal(a3.kind, "error");
        assert.notEqual(a3.message, "token endpoint is in cooldown after repeated failures");
        assert.ok(calls.includes("/endpoint-a"));
    } finally {
        __resetTokenCooldownForTests();
        restoreGlobals();
    }
});
