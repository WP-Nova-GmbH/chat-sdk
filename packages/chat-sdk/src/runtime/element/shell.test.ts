import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ACCENT, type ResolvedConfig } from "../../config/config.js";
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

test("launcher stays hidden while first-paint theme is pending", () => {
    const element = makeElement() as {
        shell: {
            launcher: { hidden: boolean };
            launcherThemeReady: boolean;
            syncLauncherThemeVisibility: () => void;
            revealLauncherTheme: () => void;
        };
        hasAttribute: (name: string) => boolean;
    };
    element.shell.launcher = { hidden: false };
    element.shell.launcherThemeReady = false;

    element.shell.syncLauncherThemeVisibility();

    assert.equal(element.hasAttribute("launcher-theme-pending"), true);
    assert.equal(element.shell.launcher.hidden, true);

    element.shell.revealLauncherTheme();

    assert.equal(element.hasAttribute("launcher-theme-pending"), false);
    assert.equal(element.shell.launcher.hidden, false);
});

test("setConfig seeds host launcher colors before shadow render", () => {
    const appliedTheme: Array<[string, string]> = [];
    const element = makeElement() as {
        style: { setProperty: (name: string, value: string) => void };
        shell: { rendered: boolean };
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            triggerColor?: string;
            triggerIconColor?: string;
        }) => void;
    };
    element.style.setProperty = (name, value) => {
        appliedTheme.push([name, value]);
    };

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        triggerColor: "#276b55",
        triggerIconColor: "dark",
    });

    assert.equal(element.shell.rendered, false);
    assert.deepEqual(appliedTheme, [
        ["--wpn-accent", "#276b55"],
        ["--wpn-launcher-icon", "#0f1117"],
    ]);
});

test("render omits microphone delegation unless voice mode is enabled", () => {
    const element = makeElement() as {
        shadowRoot?: { innerHTML: string };
        shell: { render: (config: ResolvedConfig) => void };
    };

    element.shell.render(resolvedConfig());

    assert.equal(element.shadowRoot?.innerHTML.includes('allow="microphone"'), false);
});

test("render delegates microphone access when voice mode is enabled", () => {
    const element = makeElement() as {
        shadowRoot?: { innerHTML: string };
        shell: { render: (config: ResolvedConfig) => void };
    };

    element.shell.render(
        resolvedConfig({
            iframeSrc: "https://chat.wp-nova.ai/embed/chat?surface=surf_1&voice=1",
            voiceModeEnabled: true,
        }),
    );

    assert.equal(element.shadowRoot?.innerHTML.includes('allow="microphone"'), true);
});

test("render falls back to DEFAULT_ACCENT for a non-hex triggerColor", () => {
    const element = makeElement() as {
        shadowRoot?: { innerHTML: string };
        shell: { render: (config: ResolvedConfig) => void };
    };

    element.shell.render(
        resolvedConfig({ triggerColor: "red;}#launcher{background:url(evil)}" }),
    );
    const html = element.shadowRoot?.innerHTML ?? "";

    assert.equal(html.includes(`--wpn-accent:${DEFAULT_ACCENT}`), true);
    assert.equal(html.includes("background:url(evil)"), false);
});

test("render passes a valid hex triggerColor through to the shadow style", () => {
    const element = makeElement() as {
        shadowRoot?: { innerHTML: string };
        shell: { render: (config: ResolvedConfig) => void };
    };

    element.shell.render(resolvedConfig({ triggerColor: "#abcdef" }));

    assert.equal(element.shadowRoot?.innerHTML.includes("--wpn-accent:#abcdef"), true);
});
