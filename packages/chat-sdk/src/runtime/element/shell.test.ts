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
        ["--wpn-frame-background", "#ffffff"],
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

    element.shell.render(resolvedConfig({ triggerColor: "red;}#launcher{background:url(evil)}" }));
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

test("launcher click is contained inside the SDK shadow UI", () => {
    let toggles = 0;
    let stopped = false;
    const element = makeElement() as {
        shadowRoot?: {
            getElementById: (id: string) => {
                dispatch: (name: string, event: Event) => void;
            };
        };
        shell: { render: (config: ResolvedConfig) => void };
        toggle: () => void;
    };
    element.toggle = () => {
        toggles++;
    };
    element.shell.render(resolvedConfig());

    element.shadowRoot?.getElementById("launcher").dispatch("click", {
        stopPropagation: () => {
            stopped = true;
        },
    } as Event);

    assert.equal(stopped, true);
    assert.equal(toggles, 1);
});

test("open-close-open hides the launcher without replacing the iframe", () => {
    const element = makeElement() as {
        shadowRoot?: {
            getElementById: (id: string) => { hidden: boolean };
        };
        setAttribute: (name: string) => void;
        removeAttribute: (name: string) => void;
        shell: {
            frame?: unknown;
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
            setOpen: (isOpen: boolean) => void;
        };
    };
    const config = resolvedConfig();
    element.shell.applyConfig(config);
    element.shell.render(config);
    const iframe = element.shell.frame;
    const panel = element.shadowRoot?.getElementById("panel");
    const launcher = element.shadowRoot?.getElementById("launcher");

    element.setAttribute("open");
    element.shell.setOpen(true);
    assert.equal(panel?.hidden, false);
    assert.equal(launcher?.hidden, true);
    assert.equal(element.shell.frame, iframe);

    element.removeAttribute("open");
    element.shell.setOpen(false);
    assert.equal(panel?.hidden, true);
    assert.equal(launcher?.hidden, false);
    assert.equal(element.shell.frame, iframe);

    element.setAttribute("open");
    element.shell.setOpen(true);
    assert.equal(panel?.hidden, false);
    assert.equal(launcher?.hidden, true);
    assert.equal(element.shell.frame, iframe);
});

test("desktop panel reuses the launcher's bottom offset while mobile stays full viewport", () => {
    const element = makeElement() as {
        shadowRoot?: { innerHTML: string };
        shell: { render: (config: ResolvedConfig) => void };
    };

    element.shell.render(resolvedConfig({ theme: "dark" }));
    const html = element.shadowRoot?.innerHTML ?? "";

    assert.equal(html.includes("#panel{position:fixed;right:24px;bottom:24px"), true);
    assert.equal(html.includes("max-height:calc(100vh - 48px)"), true);
    assert.equal(html.includes("#panel{right:0;bottom:0;width:100vw;height:100dvh"), true);
    assert.equal(html.includes("--wpn-frame-background:#0f1117"), true);
});
