import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ACCENT, type ResolvedConfig } from "../../config/config.js";
import { SIDEBAR_RESIZE_EVENT } from "./shell.js";
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

test("custom element opts its launcher, panel, and iframe out of host snapshots", () => {
    const element = makeElement() as {
        connectedCallback: () => void;
        hasAttribute: (name: string) => boolean;
    };
    element.connectedCallback();

    assert.equal(element.hasAttribute("data-wp-nova-ignore"), true);
});

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

test("launcher can be disabled and re-enabled without replacing the iframe", () => {
    const element = makeElement() as {
        shadowRoot?: {
            getElementById: (id: string) => { hidden: boolean };
        };
        shell: {
            frame?: unknown;
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
        };
    };
    const disabledConfig = resolvedConfig({ launcherEnabled: false });
    element.shell.applyConfig(disabledConfig);
    element.shell.render(disabledConfig);
    const iframe = element.shell.frame;
    const launcher = element.shadowRoot?.getElementById("launcher");

    assert.equal(launcher?.hidden, true);

    element.shell.applyConfig(resolvedConfig({ launcherEnabled: true }));
    assert.equal(launcher?.hidden, false);
    assert.equal(element.shell.frame, iframe);

    element.shell.applyConfig(disabledConfig);
    assert.equal(launcher?.hidden, true);
    assert.equal(element.shell.frame, iframe);
});

test("open-state events describe real transitions only", () => {
    const changes: boolean[] = [];
    const element = makeElement() as {
        addEventListener: (name: string, listener: (event: Event) => void) => void;
        close: () => void;
        isOpen: boolean;
        open: () => void;
        toggle: () => void;
    };
    element.addEventListener("wp-nova:open-change", (event) => {
        changes.push((event as CustomEvent<{ open: boolean }>).detail.open);
    });

    element.open();
    element.open();
    assert.equal(element.isOpen, true);

    element.toggle();
    element.close();
    assert.equal(element.isOpen, false);
    assert.deepEqual(changes, [true, false]);
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
        ["--wpn-sidebar-shadow", "-14px 0 32px -26px rgba(22,18,42,.38)"],
        ["--wpn-sidebar-width", "384px"],
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

test("sidebar fills its layout column and collapses the host width while closed", () => {
    const element = makeElement() as {
        getAttribute: (name: string) => string | null;
        shadowRoot?: {
            innerHTML: string;
            getElementById: (id: string) => {
                getAttribute: (name: string) => string | undefined;
            };
        };
        shell: {
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
        };
    };
    const container = new HTMLElement() as HTMLElement & { layoutWidth: number };
    container.layoutWidth = 900;
    container.appendChild(element as unknown as Node);
    const config = resolvedConfig({ presentationMode: "sidebar", sidebarWidth: 420 });

    element.shell.applyConfig(config);
    element.shell.render(config);

    const html = element.shadowRoot?.innerHTML ?? "";
    const panel = element.shadowRoot?.getElementById("panel");
    assert.equal(element.getAttribute("data-wpn-presentation"), "sidebar");
    assert.equal(element.getAttribute("data-wpn-effective-presentation"), "sidebar");
    assert.equal(
        html.includes(
            ":host([data-wpn-effective-presentation='sidebar'][open]){inline-size:var(--wpn-sidebar-width);}",
        ),
        true,
    );
    assert.equal(html.includes("inline-size:0;min-inline-size:0;block-size:0"), true);
    assert.equal(html.includes("--wpn-sidebar-width:420px"), true);
    // The dock is pinned to the viewport, never stretched to the host document: a grid
    // row as tall as the page would otherwise push the composer below the fold.
    assert.equal(
        html.includes(":host([data-wpn-effective-presentation='sidebar']){position:sticky;"),
        true,
    );
    assert.equal(html.includes("align-self:start;"), true);
    assert.equal(
        html.includes("block-size:calc(100dvh - var(--wpn-sidebar-offset,0px));max-block-size:100%;"),
        true,
    );
    assert.equal(html.includes("align-self:stretch"), false);
    assert.equal(
        html.includes("width:100%;height:100%;max-width:none;max-height:none;border-radius:0;"),
        true,
    );
    assert.equal(panel?.getAttribute("role"), "complementary");
    assert.equal(panel?.getAttribute("aria-modal"), undefined);
});

test("sidebar responsively falls back to pop-over and returns without replacing the iframe", () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    let disconnects = 0;
    Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        value: class {
            constructor(callback: ResizeObserverCallback) {
                resizeCallback = callback;
            }
            observe() {}
            disconnect() {
                disconnects++;
            }
        },
    });
    const element = makeElement() as {
        getAttribute: (name: string) => string | null;
        shadowRoot?: {
            getElementById: (id: string) => {
                getAttribute: (name: string) => string | undefined;
            };
        };
        shell: {
            frame?: unknown;
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
            reset: () => void;
        };
    };
    const container = new HTMLElement() as HTMLElement & { layoutWidth: number };
    container.layoutWidth = 900;
    container.appendChild(element as unknown as Node);
    const config = resolvedConfig({ presentationMode: "sidebar", sidebarWidth: 500 });
    element.shell.applyConfig(config);
    element.shell.render(config);
    const iframe = element.shell.frame;
    const panel = element.shadowRoot?.getElementById("panel");

    resizeCallback?.(
        [
            {
                target: container,
                contentRect: { width: 883 },
            } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
    );
    assert.equal(element.getAttribute("data-wpn-effective-presentation"), "popover");
    assert.equal(panel?.getAttribute("role"), "dialog");
    assert.equal(panel?.getAttribute("aria-modal"), "false");

    resizeCallback?.(
        [
            {
                target: container,
                contentRect: { width: 884 },
            } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
    );
    assert.equal(element.getAttribute("data-wpn-effective-presentation"), "sidebar");
    assert.equal(panel?.getAttribute("role"), "complementary");
    assert.equal(element.shell.frame, iframe);

    element.shell.reset();
    assert.equal(disconnects, 1);
});

test("presentation and width switch in place without replacing the iframe", () => {
    const element = makeElement() as {
        getAttribute: (name: string) => string | null;
        shell: {
            frame?: unknown;
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
        };
    };
    const container = new HTMLElement() as HTMLElement & { layoutWidth: number };
    container.layoutWidth = 1000;
    container.appendChild(element as unknown as Node);
    const popover = resolvedConfig();
    element.shell.applyConfig(popover);
    element.shell.render(popover);
    const iframe = element.shell.frame;

    element.shell.applyConfig(resolvedConfig({ presentationMode: "sidebar", sidebarWidth: 512 }));
    assert.equal(element.getAttribute("data-wpn-presentation"), "sidebar");
    assert.equal(element.getAttribute("data-wpn-effective-presentation"), "sidebar");
    assert.equal(element.shell.frame, iframe);

    element.shell.applyConfig(popover);
    assert.equal(element.getAttribute("data-wpn-presentation"), "popover");
    assert.equal(element.getAttribute("data-wpn-effective-presentation"), "popover");
    assert.equal(element.shell.frame, iframe);
});

test("window resize fallback uses the default 768px docking threshold", () => {
    let resizeListener: (() => void) | undefined;
    let removedListener: (() => void) | undefined;
    Reflect.deleteProperty(globalThis, "ResizeObserver");
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            addEventListener(name: string, listener: () => void) {
                if (name === "resize") resizeListener = listener;
            },
            removeEventListener(name: string, listener: () => void) {
                if (name === "resize") removedListener = listener;
            },
        },
    });
    const element = makeElement() as {
        getAttribute: (name: string) => string | null;
        shell: {
            applyConfig: (config: ResolvedConfig) => void;
            reset: () => void;
        };
    };
    const container = new HTMLElement() as HTMLElement & { layoutWidth: number };
    container.layoutWidth = 767;
    container.appendChild(element as unknown as Node);

    element.shell.applyConfig(resolvedConfig({ presentationMode: "sidebar", sidebarWidth: 384 }));
    assert.equal(element.getAttribute("data-wpn-effective-presentation"), "popover");

    container.layoutWidth = 768;
    resizeListener?.();
    assert.equal(element.getAttribute("data-wpn-effective-presentation"), "sidebar");

    element.shell.reset();
    assert.equal(removedListener, resizeListener);
});

test("sidebar resizing is opt-in and preserves the iframe while dragging or using keys", () => {
    const resizedWidths: number[] = [];
    const windowListeners = new Map<string, (event: Event) => void>();
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            addEventListener(name: string, listener: (event: Event) => void) {
                windowListeners.set(name, listener);
            },
            removeEventListener(name: string, listener: (event: Event) => void) {
                if (windowListeners.get(name) === listener) windowListeners.delete(name);
            },
        },
    });
    const element = makeElement() as {
        addEventListener: (name: string, listener: (event: Event) => void) => void;
        getAttribute: (name: string) => string | null;
        setAttribute: (name: string) => void;
        shadowRoot?: {
            innerHTML: string;
            getElementById: (id: string) => {
                dispatch: (name: string, event: Event) => void;
                getAttribute: (name: string) => string | undefined;
            };
        };
        style: { getPropertyValue: (name: string) => string };
        shell: {
            frame?: unknown;
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
        };
    };
    const container = new HTMLElement() as HTMLElement & { layoutWidth: number };
    container.layoutWidth = 1000;
    container.appendChild(element as unknown as Node);
    const fixed = resolvedConfig({
        presentationMode: "sidebar",
        sidebarWidth: 420,
        sidebarResizable: false,
    });
    element.shell.applyConfig(fixed);
    element.shell.render(fixed);
    element.setAttribute("open");
    const iframe = element.shell.frame;
    const resizer = element.shadowRoot?.getElementById("sidebar-resizer");
    element.addEventListener(SIDEBAR_RESIZE_EVENT, (event) => {
        resizedWidths.push((event as CustomEvent<{ width: number }>).detail.width);
    });

    assert.equal(element.getAttribute("data-wpn-sidebar-resizable"), null);
    assert.equal(element.shadowRoot?.innerHTML.includes("#sidebar-resizer{display:none;}"), true);
    assert.equal(
        element.shadowRoot?.innerHTML.includes(
            "inline-size:3px;block-size:36px;border-radius:999px;background:var(--wpn-accent);",
        ),
        true,
    );
    assert.equal(
        element.shadowRoot?.innerHTML.includes(
            "opacity:.28;transform:translateY(-50%);transition:opacity .14s,transform .14s;",
        ),
        true,
    );
    resizer?.dispatch("pointerdown", pointerEvent({ clientX: 500, pointerId: 1 }));
    resizer?.dispatch("pointermove", pointerEvent({ clientX: 450, pointerId: 1 }));
    resizer?.dispatch("pointerup", pointerEvent({ clientX: 450, pointerId: 1 }));
    assert.equal(element.style.getPropertyValue("--wpn-sidebar-width"), "420px");
    assert.deepEqual(resizedWidths, []);

    element.shell.applyConfig({ ...fixed, sidebarResizable: true });
    assert.equal(element.getAttribute("data-wpn-sidebar-resizable"), "");
    resizer?.dispatch("pointerdown", pointerEvent({ clientX: 500, pointerId: 2 }));
    windowListeners.get("pointermove")?.(pointerEvent({ clientX: 450, pointerId: 2 }));
    windowListeners.get("pointerup")?.(pointerEvent({ clientX: 450, pointerId: 2 }));
    assert.equal(element.style.getPropertyValue("--wpn-sidebar-width"), "470px");
    assert.equal(resizer?.getAttribute("aria-valuenow"), "470");
    assert.deepEqual(resizedWidths, [470]);
    assert.equal(windowListeners.has("pointermove"), false);

    resizer?.dispatch("keydown", keyboardEvent("ArrowLeft"));
    assert.equal(element.style.getPropertyValue("--wpn-sidebar-width"), "486px");
    resizer?.dispatch("keydown", keyboardEvent("Home"));
    assert.equal(element.style.getPropertyValue("--wpn-sidebar-width"), "320px");
    resizer?.dispatch("keydown", keyboardEvent("End"));
    assert.equal(element.style.getPropertyValue("--wpn-sidebar-width"), "616px");
    assert.equal(resizer?.getAttribute("aria-valuemax"), "616");
    assert.deepEqual(resizedWidths, [470, 486, 320, 616]);
    assert.equal(element.shell.frame, iframe);
});

function pointerEvent({
    clientX,
    pointerId,
}: {
    clientX: number;
    pointerId: number;
}): PointerEvent {
    return {
        button: 0,
        clientX,
        pointerId,
        preventDefault() {},
        stopPropagation() {},
    } as PointerEvent;
}

function keyboardEvent(key: string): KeyboardEvent {
    return {
        key,
        preventDefault() {},
        stopPropagation() {},
    } as KeyboardEvent;
}
