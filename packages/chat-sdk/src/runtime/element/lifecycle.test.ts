import assert from "node:assert/strict";
import test from "node:test";
import { type ResolvedConfig, resolveConfig } from "../../config/config.js";
import type { EmbedFrame, SdkFrame } from "../../protocol/types/index.js";
import { EMBED_SOURCE } from "../../protocol/types/index.js";
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

test("config changes that target a different iframe reset bridge and buffered auth", () => {
    let stopped = false;
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: { stop: () => void };
        lastAuth?: unknown;
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            baseUrl?: string;
            accent?: string;
            voiceMode?: boolean;
        }) => void;
    };
    element.resolved = resolvedConfig();
    element.bridge = {
        stop: () => {
            stopped = true;
        },
    };
    element.lastAuth = { kind: "granted", token: "old-token", expiresIn: 60 };

    element.setConfig({
        publicSurfaceId: "surf_2",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        accent: "#222222",
    });

    assert.equal(stopped, true);
    assert.equal(element.bridge, undefined);
    assert.equal(element.lastAuth, undefined);
    assert.equal(element.resolved?.iframeSrc.includes("surface=surf_2"), true);
});

test("config changes that toggle voice mode reset the iframe", () => {
    let stopped = false;
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: { stop: () => void };
        lastAuth?: unknown;
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            baseUrl?: string;
            voiceMode?: boolean;
        }) => void;
    };
    element.resolved = resolvedConfig();
    element.bridge = {
        stop: () => {
            stopped = true;
        },
    };
    element.lastAuth = { kind: "granted", token: "old-token", expiresIn: 60 };

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        voiceMode: true,
    });

    assert.equal(stopped, true);
    assert.equal(element.bridge, undefined);
    assert.equal(element.lastAuth, undefined);
    assert.equal(element.resolved?.voiceModeEnabled, true);
    assert.equal(new URL(element.resolved?.iframeSrc ?? "").searchParams.get("voice"), "1");
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

test("live host theme changes reuse the bridge and iframe", () => {
    const sentThemes: string[] = [];
    const panelShadows: string[] = [];
    let stopped = false;
    let tokenAcquisitions = 0;
    const initial = resolveConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        theme: "light",
    });
    const bridge = {
        sendHostTheme: (theme: string) => sentThemes.push(theme),
        stop: () => {
            stopped = true;
        },
    };
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: typeof bridge;
        iframeReady: boolean;
        isConnected: boolean;
        style: { setProperty: (name: string, value: string) => void };
        shell: {
            frame?: unknown;
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
        };
        acquireToken: () => Promise<void>;
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            theme: "light" | "dark";
        }) => void;
    };
    element.resolved = initial;
    element.style.setProperty = (name, value) => {
        if (name === "--wpn-panel-shadow") panelShadows.push(value);
    };
    element.shell.applyConfig(initial);
    element.shell.render(initial);
    element.bridge = bridge;
    element.iframeReady = true;
    element.isConnected = true;
    element.acquireToken = async () => {
        tokenAcquisitions++;
    };
    const iframe = element.shell.frame;

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        theme: "dark",
    });

    assert.equal(stopped, false);
    assert.equal(element.bridge, bridge);
    assert.equal(element.shell.frame, iframe);
    assert.equal(tokenAcquisitions, 0);
    assert.deepEqual(sentThemes, ["dark"]);
    assert.deepEqual(panelShadows, [
        "0 1px 2px rgba(22,18,42,.05),0 22px 50px -18px rgba(22,18,42,.30)",
        "0 1px 2px rgba(0,0,0,.40),0 18px 44px -16px rgba(0,0,0,.60)",
    ]);
    assert.equal(element.resolved?.theme, "dark");
});

test("live token-endpoint changes reuse the iframe but acquire fresh auth", () => {
    let tokenAcquisitions = 0;
    const initial = resolveConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token-a",
    });
    const bridge = {
        sendHostTheme: (_theme: string) => undefined,
        stop: () => undefined,
    };
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: typeof bridge;
        iframeReady: boolean;
        isConnected: boolean;
        shell: { frame?: unknown; render: (config: ResolvedConfig) => void };
        acquireToken: () => Promise<void>;
        setConfig: (config: { publicSurfaceId: string; tokenEndpoint: string }) => void;
    };
    element.resolved = initial;
    element.shell.render(initial);
    element.bridge = bridge;
    element.iframeReady = true;
    element.isConnected = true;
    element.acquireToken = async () => {
        tokenAcquisitions++;
    };
    const iframe = element.shell.frame;

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token-b",
    });

    assert.equal(element.bridge, bridge);
    assert.equal(element.shell.frame, iframe);
    assert.equal(tokenAcquisitions, 1);
    assert.equal(element.resolved?.tokenEndpoint, "/token-b");
});

test("READY receives the current host theme before the iframe renders auth state", () => {
    let messageListener: ((event: MessageEvent) => void) | undefined;
    const posted: Array<{ frame: SdkFrame; origin: string }> = [];
    const iframeWindow = {
        postMessage(frame: SdkFrame, origin: string) {
            posted.push({ frame, origin });
        },
    } as unknown as Window;
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            addEventListener(_name: string, listener: (event: MessageEvent) => void) {
                messageListener = listener;
            },
            removeEventListener() {
                messageListener = undefined;
            },
        },
    });

    const config = resolveConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        theme: "dark",
    });
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: { start: () => void; stop: () => void };
        shell: {
            frame?: { contentWindow?: Window };
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
        };
        wireBridge: (config: ResolvedConfig) => void;
    };
    element.resolved = config;
    element.shell.applyConfig(config);
    element.shell.render(config);
    if (element.shell.frame) element.shell.frame.contentWindow = iframeWindow;
    element.wireBridge(config);
    element.bridge?.start();

    messageListener?.({
        origin: config.iframeOrigin,
        source: iframeWindow,
        data: {
            source: EMBED_SOURCE,
            protocolVersion: config.protocolVersion,
            type: "READY",
            minProtocolVersion: config.protocolVersion,
            maxProtocolVersion: config.protocolVersion,
        } satisfies EmbedFrame,
    } as MessageEvent);

    assert.deepEqual(posted[0], {
        frame: {
            source: "wp-nova-ext",
            protocolVersion: config.protocolVersion,
            type: "HOST_THEME",
            theme: "dark",
        },
        origin: config.iframeOrigin,
    });
    element.bridge?.stop();
});
