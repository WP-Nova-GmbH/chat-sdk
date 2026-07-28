import assert from "node:assert/strict";
import test from "node:test";
import {
    DEFAULT_ACCENT,
    DEFAULT_SIDEBAR_WIDTH,
    resolveConfig,
    SIDEBAR_WIDTH_MAX,
    SIDEBAR_WIDTH_MIN,
} from "./config.js";

const REQUIRED_CONFIG = {
    publicSurfaceId: "surf_1",
    tokenEndpoint: "/nova-token",
};

test("settle timings default and clamp host overrides", () => {
    assert.deepEqual(resolveConfig(REQUIRED_CONFIG).settle, {
        quietMs: 200,
        maxWaitMs: 1600,
        waitForNavigationSignal: false,
    });
    assert.deepEqual(
        resolveConfig({
            ...REQUIRED_CONFIG,
            settle: {
                quietMs: 5000,
                maxWaitMs: 10_000,
                waitForNavigationSignal: true,
            },
        }).settle,
        { quietMs: 1000, maxWaitMs: 5000, waitForNavigationSignal: true },
    );
    // maxWaitMs can never undercut the quiet window.
    assert.deepEqual(
        resolveConfig({ ...REQUIRED_CONFIG, settle: { quietMs: 500, maxWaitMs: 100 } }).settle,
        { quietMs: 500, maxWaitMs: 500, waitForNavigationSignal: false },
    );
    assert.deepEqual(
        resolveConfig({ ...REQUIRED_CONFIG, settle: { quietMs: Number.NaN, maxWaitMs: -5 } })
            .settle,
        { quietMs: 200, maxWaitMs: 1600, waitForNavigationSignal: false },
    );
});

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

test("active theme-specific trigger colors override the legacy triggerColor", () => {
    const shared = {
        ...REQUIRED_CONFIG,
        accent: "#333333",
        triggerColor: "#444444",
        triggerColorLight: "#eeeeee",
        triggerColorDark: "#111111",
    };

    assert.equal(resolveConfig({ ...shared, theme: "light" }).triggerColor, "#eeeeee");
    assert.equal(resolveConfig({ ...shared, theme: "dark" }).triggerColor, "#111111");
});

test("theme-specific trigger colors fall back through triggerColor and accent", () => {
    assert.equal(
        resolveConfig({
            ...REQUIRED_CONFIG,
            theme: "dark",
            triggerColorLight: "#eeeeee",
            triggerColor: "#444444",
            accent: "#333333",
        }).triggerColor,
        "#444444",
    );
    assert.equal(
        resolveConfig({
            ...REQUIRED_CONFIG,
            theme: "dark",
            triggerColorLight: "#eeeeee",
            accent: "#333333",
        }).triggerColor,
        "#333333",
    );
});

test("only the active theme's launcher color enables first-paint reveal", () => {
    const config = {
        ...REQUIRED_CONFIG,
        triggerColorDark: "#111111",
    };

    assert.equal(resolveConfig({ ...config, theme: "light" }).hasFirstPaintLauncherColor, false);
    assert.equal(resolveConfig({ ...config, theme: "dark" }).hasFirstPaintLauncherColor, true);
});

test("host theme defaults to light and accepts an explicit dark mode", () => {
    assert.equal(resolveConfig(REQUIRED_CONFIG).theme, "light");
    assert.equal(resolveConfig({ ...REQUIRED_CONFIG, theme: "dark" }).theme, "dark");
});

test("SDK launcher defaults to enabled and supports host-owned controls", () => {
    assert.equal(resolveConfig(REQUIRED_CONFIG).launcherEnabled, true);
    assert.equal(resolveConfig({ ...REQUIRED_CONFIG, launcher: true }).launcherEnabled, true);
    assert.equal(resolveConfig({ ...REQUIRED_CONFIG, launcher: false }).launcherEnabled, false);
});

test("presentation defaults to the backward-compatible pop-over", () => {
    const missing = resolveConfig(REQUIRED_CONFIG);
    const explicit = resolveConfig({
        ...REQUIRED_CONFIG,
        presentation: { mode: "popover" },
    });

    assert.equal(missing.presentationMode, "popover");
    assert.equal(explicit.presentationMode, "popover");
    assert.equal(missing.sidebarWidth, DEFAULT_SIDEBAR_WIDTH);
    assert.equal(explicit.sidebarWidth, DEFAULT_SIDEBAR_WIDTH);
    assert.equal(missing.sidebarResizable, false);
    assert.equal(explicit.sidebarResizable, false);
});

test("sidebar presentation defaults and clamps numeric widths", () => {
    const sidebar = resolveConfig({
        ...REQUIRED_CONFIG,
        presentation: { mode: "sidebar" },
    });

    assert.deepEqual(
        {
            mode: sidebar.presentationMode,
            width: sidebar.sidebarWidth,
            resizable: sidebar.sidebarResizable,
        },
        { mode: "sidebar", width: DEFAULT_SIDEBAR_WIDTH, resizable: false },
    );
    assert.equal(
        resolveConfig({
            ...REQUIRED_CONFIG,
            presentation: { mode: "sidebar", resizable: true },
        }).sidebarResizable,
        true,
    );
    assert.equal(
        resolveConfig({
            ...REQUIRED_CONFIG,
            presentation: { mode: "sidebar", width: 200 },
        }).sidebarWidth,
        SIDEBAR_WIDTH_MIN,
    );
    assert.equal(
        resolveConfig({
            ...REQUIRED_CONFIG,
            presentation: { mode: "sidebar", width: 900 },
        }).sidebarWidth,
        SIDEBAR_WIDTH_MAX,
    );
    assert.equal(
        resolveConfig({
            ...REQUIRED_CONFIG,
            presentation: { mode: "sidebar", width: 512.5 },
        }).sidebarWidth,
        512.5,
    );
});

test("malformed presentation values warn and use safe defaults", () => {
    const warnings: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => void warnings.push(args);
    try {
        const invalidWidth = resolveConfig({
            ...REQUIRED_CONFIG,
            presentation: { mode: "sidebar", width: "wide" } as never,
        });
        const invalidMode = resolveConfig({
            ...REQUIRED_CONFIG,
            presentation: { mode: "drawer" } as never,
        });
        const invalidResizable = resolveConfig({
            ...REQUIRED_CONFIG,
            presentation: { mode: "sidebar", resizable: "yes" } as never,
        });

        assert.equal(invalidWidth.presentationMode, "sidebar");
        assert.equal(invalidWidth.sidebarWidth, DEFAULT_SIDEBAR_WIDTH);
        assert.equal(invalidMode.presentationMode, "popover");
        assert.equal(invalidMode.sidebarWidth, DEFAULT_SIDEBAR_WIDTH);
        assert.equal(invalidResizable.sidebarResizable, false);
        assert.equal(warnings.length, 2);
    } finally {
        console.warn = originalWarn;
    }
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
                { path: "/\\evil.example/phish", description: "backslash protocol-relative" },
                { path: "https://evil.example", description: "absolute" },
                { path: "no-slash", description: "relative" },
            ],
        });

        assert.deepEqual(config.siteRoutes, [
            { path: "/orders", description: "All orders" },
            { path: "/customers/:customerId", description: "Customer detail" },
        ]);
        assert.equal(warnings.length, 5);
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
