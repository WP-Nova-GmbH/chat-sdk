import assert from "node:assert/strict";
import test from "node:test";
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
