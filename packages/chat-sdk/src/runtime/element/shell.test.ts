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
        shell: { rendered: boolean; launcherThemeReady: boolean };
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
        ["--wpn-panel-shadow", "0 1px 2px rgba(22,18,42,.05),0 22px 50px -18px rgba(22,18,42,.30)"],
        ["--wpn-panel-border", "rgba(22,18,42,.08)"],
        ["--wpn-accent", "#276b55"],
        ["--wpn-launcher-icon", "#0f1117"],
    ]);
});

test("setConfig seeds the active theme-specific launcher color before shadow render", () => {
    const appliedTheme: Array<[string, string]> = [];
    const element = makeElement() as {
        style: { setProperty: (name: string, value: string) => void };
        shell: { rendered: boolean; launcherThemeReady: boolean };
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            theme: "dark";
            triggerColor: string;
            triggerColorLight: string;
            triggerColorDark: string;
        }) => void;
    };
    element.style.setProperty = (name, value) => {
        appliedTheme.push([name, value]);
    };

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        theme: "dark",
        triggerColor: "#444444",
        triggerColorLight: "#eeeeee",
        triggerColorDark: "#111111",
    });

    assert.equal(element.shell.rendered, false);
    assert.equal(element.shell.launcherThemeReady, true);
    assert.equal(
        appliedTheme.some(([name, value]) => name === "--wpn-accent" && value === "#111111"),
        true,
    );
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

test("launcher activation events are contained inside the SDK shadow UI", () => {
    let toggles = 0;
    const stopped: string[] = [];
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

    const launcher = element.shadowRoot?.getElementById("launcher");
    for (const eventName of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        launcher?.dispatch(eventName, {
            stopPropagation: () => {
                stopped.push(eventName);
            },
        } as Event);
    }

    assert.deepEqual(stopped, ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]);
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
    assert.equal(
        html.includes(
            "--wpn-panel-shadow:0 1px 2px rgba(0,0,0,.40),0 18px 44px -16px rgba(0,0,0,.60)",
        ),
        true,
    );
    assert.equal(html.includes("box-shadow:var(--wpn-panel-shadow)"), true);
    assert.equal(html.includes("0 22px 50px -18px"), false);
});

test("panel keeps theme-matched elevation and a hairline border", () => {
    const lightElement = makeElement() as {
        shadowRoot?: { innerHTML: string };
        shell: { render: (config: ResolvedConfig) => void };
    };
    lightElement.shell.render(resolvedConfig({ theme: "light" }));
    const lightHtml = lightElement.shadowRoot?.innerHTML ?? "";

    assert.equal(
        lightHtml.includes(
            "--wpn-panel-shadow:0 1px 2px rgba(22,18,42,.05),0 22px 50px -18px rgba(22,18,42,.30)",
        ),
        true,
    );
    assert.equal(lightHtml.includes("--wpn-panel-border:rgba(22,18,42,.08)"), true);
    assert.equal(lightHtml.includes("border:1px solid var(--wpn-panel-border)"), true);

    const darkElement = makeElement() as {
        shadowRoot?: { innerHTML: string };
        shell: { render: (config: ResolvedConfig) => void };
    };
    darkElement.shell.render(resolvedConfig({ theme: "dark" }));
    const darkHtml = darkElement.shadowRoot?.innerHTML ?? "";

    assert.equal(
        darkHtml.includes(
            "--wpn-panel-shadow:0 1px 2px rgba(0,0,0,.40),0 18px 44px -16px rgba(0,0,0,.60)",
        ),
        true,
    );
    assert.equal(darkHtml.includes("--wpn-panel-border:rgba(255,255,255,.12)"), true);
});
