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

test("a development-mode token grant badges the launcher", async () => {
    __resetTokenCooldownForTests();
    const element = makeElement() as {
        resolved: Record<string, unknown>;
        acquireToken: () => Promise<void>;
        hasAttribute: (name: string) => boolean;
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
        uiDesign: "classic" as const,
        protocolVersion: 1,
    };

    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => ({
            ok: true,
            status: 200,
            json: async () => ({ access_token: "tok", expires_in: 900, developmentMode: true }),
        }),
    });
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: () => 1,
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });

    try {
        await element.acquireToken();

        assert.equal(element.hasAttribute("data-wpn-dev"), true);
    } finally {
        __resetTokenCooldownForTests();
    }
});

test("a production token grant leaves the launcher unbadged", async () => {
    __resetTokenCooldownForTests();
    const element = makeElement() as {
        resolved: Record<string, unknown>;
        acquireToken: () => Promise<void>;
        hasAttribute: (name: string) => boolean;
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
        uiDesign: "classic" as const,
        protocolVersion: 1,
    };

    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => ({
            ok: true,
            status: 200,
            json: async () => ({ access_token: "tok", expires_in: 900 }),
        }),
    });
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: () => 1,
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });

    try {
        await element.acquireToken();

        assert.equal(element.hasAttribute("data-wpn-dev"), false);
    } finally {
        __resetTokenCooldownForTests();
    }
});

test("token display settings do not override a host configured launcher theme", async () => {
    __resetTokenCooldownForTests();
    const appliedTheme: Array<[string, string]> = [];
    const element = makeElement() as {
        resolved: ResolvedConfig;
        shell: { applyConfig: (config: ResolvedConfig) => void };
        style: { setProperty: (name: string, value: string) => void };
        acquireToken: () => Promise<void>;
    };
    element.resolved = resolvedConfig({
        accent: "#b4543a",
        triggerColor: "#276b55",
        triggerIconColor: "light",
        hasFirstPaintLauncherColor: true,
    });
    element.style.setProperty = (name, value) => {
        appliedTheme.push([name, value]);
    };
    element.shell.applyConfig(element.resolved);
    appliedTheme.length = 0;

    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                access_token: "tok",
                expires_in: 900,
                displaySettings: {
                    accent: "#b4543a",
                    triggerColor: "#8e3824",
                    triggerIconColor: "dark",
                },
            }),
        }),
    });
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: () => 1,
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });

    try {
        await element.acquireToken();

        assert.deepEqual(appliedTheme, []);
    } finally {
        __resetTokenCooldownForTests();
    }
});

test("token display settings theme the launcher when the host omitted launcher colors", async () => {
    __resetTokenCooldownForTests();
    const appliedTheme: Array<[string, string]> = [];
    const element = makeElement() as {
        resolved: ResolvedConfig;
        shell: { applyConfig: (config: ResolvedConfig) => void };
        style: { setProperty: (name: string, value: string) => void };
        acquireToken: () => Promise<void>;
    };
    element.resolved = resolvedConfig({
        accent: "#8665e3",
        triggerColor: "#8665e3",
        triggerIconColor: "light",
        hasFirstPaintLauncherColor: false,
    });
    element.style.setProperty = (name, value) => {
        appliedTheme.push([name, value]);
    };
    element.shell.applyConfig(element.resolved);
    appliedTheme.length = 0;

    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                access_token: "tok",
                expires_in: 900,
                displaySettings: {
                    accent: "#b4543a",
                    triggerColor: "#276b55",
                    triggerIconColor: "dark",
                },
            }),
        }),
    });
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: () => 1,
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });

    try {
        await element.acquireToken();

        assert.deepEqual(appliedTheme, [
            ["--wpn-accent", "#276b55"],
            ["--wpn-launcher-icon", "#0f1117"],
        ]);
    } finally {
        __resetTokenCooldownForTests();
    }
});
