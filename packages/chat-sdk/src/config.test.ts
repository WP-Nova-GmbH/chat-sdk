import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ACCENT, resolveConfig } from "./config.js";

const REQUIRED_CONFIG = {
    publicSurfaceId: "surf_1",
    tokenEndpoint: "/nova-token",
};

test("config without theme input keeps launcher pending for first paint", () => {
    const config = resolveConfig(REQUIRED_CONFIG);

    assert.equal(config.triggerColor, DEFAULT_ACCENT);
    assert.equal(config.hasFirstPaintLauncherColor, false);
});

test("accent is a valid first-paint launcher fallback", () => {
    const config = resolveConfig({
        ...REQUIRED_CONFIG,
        accent: "#1f9d63",
    });

    assert.equal(config.triggerColor, "#1f9d63");
    assert.equal(config.hasFirstPaintLauncherColor, true);
});

test("triggerColor is used directly for first-paint launcher theming", () => {
    const config = resolveConfig({
        ...REQUIRED_CONFIG,
        accent: "#1f9d63",
        triggerColor: "#0f1117",
    });

    assert.equal(config.triggerColor, "#0f1117");
    assert.equal(config.hasFirstPaintLauncherColor, true);
});

test("voice mode is disabled by default and omitted from the iframe URL", () => {
    const config = resolveConfig(REQUIRED_CONFIG);

    assert.equal(config.voiceModeEnabled, false);
    assert.equal(new URL(config.iframeSrc).searchParams.has("voice"), false);
});

test("voice mode opt-in adds the iframe URL capability signal", () => {
    const config = resolveConfig({
        ...REQUIRED_CONFIG,
        voiceMode: true,
    });

    assert.equal(config.voiceModeEnabled, true);
    assert.equal(new URL(config.iframeSrc).searchParams.get("voice"), "1");
});
