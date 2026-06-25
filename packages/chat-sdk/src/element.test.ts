import assert from "node:assert/strict";
import test from "node:test";
import type { ResolvedConfig } from "./config.js";
import type { WpNovaChatElement } from "./element.js";
import { __resetTokenCooldownForTests } from "./token.js";

const ORIGINALS = {
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
    fetch: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
    setTimeout: Object.getOwnPropertyDescriptor(globalThis, "setTimeout"),
    clearTimeout: Object.getOwnPropertyDescriptor(globalThis, "clearTimeout"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
};

class FakeHTMLElement {
    isConnected = false;
    private readonly attributes = new Set<string>();
    readonly style = {
        setProperty: (_name: string, _value: string) => undefined,
        removeProperty: (_name: string) => undefined,
    };

    setAttribute(name: string): void {
        this.attributes.add(name);
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }
}

function installElementGlobals(): void {
    Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        value: FakeHTMLElement,
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { origin: "https://app.example" },
    });
}

function restoreElementGlobals(): void {
    for (const [key, descriptor] of Object.entries(ORIGINALS)) {
        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    }
}

function makeElement(): unknown {
    installElementGlobals();
    return new ElementConstructor() as WpNovaChatElement;
}

function resolvedConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
    return {
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        iframeOrigin: "https://chat.wp-nova.ai",
        iframeSrc: "https://chat.wp-nova.ai/embed/chat?surface=surf_1",
        title: "Assistant",
        accent: "#111111",
        triggerColor: "#111111",
        triggerIconColor: "light",
        hasFirstPaintLauncherColor: true,
        safeValueSelectors: [],
        protocolVersion: 1,
        ...overrides,
    };
}

let ElementConstructor: typeof WpNovaChatElement;

test.before(async () => {
    installElementGlobals();
    ({ WpNovaChatElement: ElementConstructor } = await import("./element.js"));
});

test.after(() => {
    restoreElementGlobals();
});

test("launcher stays hidden while first-paint theme is pending", () => {
    const element = makeElement() as {
        launcher: { hidden: boolean };
        launcherThemeReady: boolean;
        hasAttribute: (name: string) => boolean;
        syncLauncherThemeVisibility: () => void;
        revealLauncherTheme: () => void;
    };
    element.launcher = { hidden: false };
    element.launcherThemeReady = false;

    element.syncLauncherThemeVisibility();

    assert.equal(element.hasAttribute("launcher-theme-pending"), true);
    assert.equal(element.launcher.hidden, true);

    element.revealLauncherTheme();

    assert.equal(element.hasAttribute("launcher-theme-pending"), false);
    assert.equal(element.launcher.hidden, false);
});

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
        lastToken?: string;
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
    assert.equal(element.lastToken, undefined);
});

test("config changes that target a different iframe reset bridge and buffered auth", () => {
    let stopped = false;
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: { stop: () => void };
        lastToken?: string;
        lastUnavailable?: { email: string; message: string };
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            baseUrl?: string;
            accent?: string;
        }) => void;
    };
    element.resolved = resolvedConfig();
    element.bridge = {
        stop: () => {
            stopped = true;
        },
    };
    element.lastToken = "old-token";
    element.lastUnavailable = { email: "old@example.com", message: "Old" };

    element.setConfig({
        publicSurfaceId: "surf_2",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        accent: "#222222",
    });

    assert.equal(stopped, true);
    assert.equal(element.bridge, undefined);
    assert.equal(element.lastToken, undefined);
    assert.equal(element.lastUnavailable, undefined);
    assert.equal(element.resolved?.iframeSrc.includes("surface=surf_2"), true);
});

test("READY protocol range must include the SDK protocol", () => {
    const element = makeElement() as {
        isProtocolCompatible: (
            config: ResolvedConfig,
            minVersion?: number,
            maxVersion?: number,
        ) => boolean;
    };
    const config = resolvedConfig({ protocolVersion: 2 });

    assert.equal(element.isProtocolCompatible(config, 1, 3), true);
    assert.equal(element.isProtocolCompatible(config, 3, 4), false);
    assert.equal(element.isProtocolCompatible(config, 0, 1), false);
});
