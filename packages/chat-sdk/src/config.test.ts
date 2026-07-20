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

test("site routes default to empty when not configured", () => {
    assert.deepEqual(resolveConfig(REQUIRED_CONFIG).siteRoutes, []);
});

test("site routes keep only same-origin relative paths, deduped and trimmed", () => {
    const warnings: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args);
    try {
        const config = resolveConfig({
            ...REQUIRED_CONFIG,
            routes: [
                { path: "/orders", description: "All orders" },
                { path: "  /customers/:customerId  ", description: "  Customer detail  " },
                { path: "/orders", description: "duplicate" },
                { path: "//evil.example/phish", description: "protocol-relative" },
                { path: "https://evil.example", description: "absolute" },
                { path: "no-slash", description: "relative" },
            ],
        });

        assert.deepEqual(config.siteRoutes, [
            { path: "/orders", description: "All orders" },
            { path: "/customers/:customerId", description: "Customer detail" },
        ]);
        assert.equal(warnings.length, 4);
    } finally {
        console.warn = originalWarn;
    }
});

test("site routes are capped at the server-side bound", () => {
    const originalWarn = console.warn;
    console.warn = () => undefined;
    try {
        const config = resolveConfig({
            ...REQUIRED_CONFIG,
            routes: Array.from({ length: 150 }, (_, index) => ({
                path: `/page-${index}`,
                description: `Page ${index}`,
            })),
        });

        assert.equal(config.siteRoutes.length, 100);
        assert.equal(config.siteRoutes[99]?.path, "/page-99");
    } finally {
        console.warn = originalWarn;
    }
});
