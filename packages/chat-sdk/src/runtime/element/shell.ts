import {
    DEFAULT_ACCENT,
    DEFAULT_SIDEBAR_WIDTH,
    type ResolvedConfig,
    SIDEBAR_WIDTH_MAX,
    SIDEBAR_WIDTH_MIN,
} from "../../config/config.js";

/** Message-circle glyph used by the settings preview and SDK launcher. */
const LAUNCHER_CHAT_SVG =
    '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';

/** Bubbling events emitted by a primary pointer/mouse button activation. */
const LAUNCHER_ACTIVATION_EVENTS = ["pointerdown", "pointerup", "mousedown", "mouseup"] as const;

/**
 * Theme-matched tokens for SDK-owned chrome. The navy elevation used on light
 * pages reads as a smudgy halo on dark ones, so dark surfaces use tighter,
 * near-black shadows and a light hairline border.
 */
const SHELL_THEME = {
    light: {
        frameBackground: "#ffffff",
        panelShadow:
            "0 1px 2px rgba(22,18,42,.05),0 22px 50px -18px rgba(22,18,42,.30)",
        panelBorder: "rgba(22,18,42,.08)",
        sidebarShadow: "-14px 0 32px -26px rgba(22,18,42,.38)",
    },
    dark: {
        frameBackground: "#0f1117",
        panelShadow: "0 1px 2px rgba(0,0,0,.40),0 18px 44px -16px rgba(0,0,0,.60)",
        panelBorder: "rgba(255,255,255,.12)",
        sidebarShadow: "-14px 0 32px -26px rgba(0,0,0,.72)",
    },
} as const;

/** Main-content space kept available before a requested sidebar falls back. */
export const MIN_SIDEBAR_MAIN_CONTENT_WIDTH = 384;

/** Emitted when pointer or keyboard resizing commits a new sidebar width. */
export const SIDEBAR_RESIZE_EVENT = "wp-nova:sidebar-resize";

export interface SidebarResizeDetail {
    width: number;
}

const SIDEBAR_KEYBOARD_RESIZE_STEP = 16;

interface SidebarResizeSession {
    pointerId: number;
    startClientX: number;
    startWidth: number;
    direction: 1 | -1;
    changed: boolean;
}

/** Minimal attribute escaping for values interpolated into the shadow markup. */
function escapeAttr(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Matches supported hex color values for SDK-owned chrome. */
function isHexColor(value: string): boolean {
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value.trim());
}

function resolveLauncherIconColor(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    if (normalized === "light") return "#ffffff";
    if (normalized === "dark") return "#0f1117";
    if (isHexColor(normalized)) return value.trim();
    return null;
}

export class ChatShell {
    private iframe?: HTMLIFrameElement;
    private panel?: HTMLElement;
    private launcher?: HTMLButtonElement;
    private sidebarResizer?: HTMLElement;
    private shadowReady = false;
    private launcherThemeReady = false;
    private launcherEnabled = true;
    private developmentMode = false;
    private hostConfiguredLauncherColor = false;
    private presentationMode: ResolvedConfig["presentationMode"] = "popover";
    private sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
    private sidebarResizable = false;
    private effectivePresentationMode: ResolvedConfig["presentationMode"] = "popover";
    private sidebarResizeSession?: SidebarResizeSession;
    private observedContainer?: HTMLElement;
    private resizeObserver?: ResizeObserver;
    private resizeAnimationFrame?: number;
    private resizeFallbackActive = false;
    private readonly onWindowResize = (): void => this.syncEffectivePresentation();
    private readonly onContainerResize: ResizeObserverCallback = (entries): void => {
        const entry = entries.find((candidate) => candidate.target === this.observedContainer);
        const width = entry?.contentRect.width;
        if (typeof requestAnimationFrame === "undefined") {
            this.syncEffectivePresentation(width);
            return;
        }
        if (this.resizeAnimationFrame != null) {
            cancelAnimationFrame(this.resizeAnimationFrame);
        }
        this.resizeAnimationFrame = requestAnimationFrame(() => {
            this.resizeAnimationFrame = undefined;
            this.syncEffectivePresentation(width);
        });
    };
    private readonly onSidebarResizePointerDown = (event: PointerEvent): void => {
        if (
            event.button !== 0 ||
            !this.sidebarResizable ||
            this.effectivePresentationMode !== "sidebar"
        ) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.sidebarResizer?.setPointerCapture(event.pointerId);
        this.sidebarResizeSession = {
            pointerId: event.pointerId,
            startClientX: event.clientX,
            startWidth: this.sidebarWidth,
            direction: this.inlineResizeDirection(),
            changed: false,
        };
        this.listenForSidebarResize();
        this.host.setAttribute("data-wpn-sidebar-resizing", "");
    };
    private readonly onSidebarResizePointerMove = (event: PointerEvent): void => {
        const session = this.sidebarResizeSession;
        if (!session || session.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const width =
            session.startWidth +
            (event.clientX - session.startClientX) * session.direction;
        session.changed = this.applyUserSidebarWidth(width) || session.changed;
    };
    private readonly onSidebarResizePointerUp = (event: PointerEvent): void => {
        const session = this.sidebarResizeSession;
        if (!session || session.pointerId !== event.pointerId) return;
        this.onSidebarResizePointerMove(event);
        this.finishSidebarResize(event.pointerId, session.changed);
    };
    private readonly onSidebarResizePointerCancel = (event: PointerEvent): void => {
        if (this.sidebarResizeSession?.pointerId !== event.pointerId) return;
        this.finishSidebarResize(event.pointerId, false);
    };
    private readonly onSidebarResizeLostPointerCapture = (event: PointerEvent): void => {
        const session = this.sidebarResizeSession;
        if (!session || session.pointerId !== event.pointerId) return;
        this.finishSidebarResize(event.pointerId, session.changed);
    };
    private readonly onSidebarResizeKeyDown = (event: KeyboardEvent): void => {
        if (!this.sidebarResizable || this.effectivePresentationMode !== "sidebar") return;

        let width: number;
        if (event.key === "Home") {
            width = SIDEBAR_WIDTH_MIN;
        } else if (event.key === "End") {
            width = this.sidebarResizeMax();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const physicalDelta =
                event.key === "ArrowLeft"
                    ? -SIDEBAR_KEYBOARD_RESIZE_STEP
                    : SIDEBAR_KEYBOARD_RESIZE_STEP;
            width = this.sidebarWidth + physicalDelta * this.inlineResizeDirection();
        } else {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (this.applyUserSidebarWidth(width)) this.emitSidebarResize();
    };

    constructor(private readonly host: HTMLElement & { toggle(): void }) {}

    get frame(): HTMLIFrameElement | undefined {
        return this.iframe;
    }

    get rendered(): boolean {
        return this.shadowReady;
    }

    applyConfig(config: ResolvedConfig): void {
        const theme = SHELL_THEME[config.theme];
        this.hostConfiguredLauncherColor = config.hasFirstPaintLauncherColor;
        this.launcherEnabled = config.launcherEnabled;
        this.presentationMode = config.presentationMode;
        this.sidebarWidth = config.sidebarWidth;
        this.sidebarResizable = config.sidebarResizable;
        // Once trusted surface settings have revealed the launcher, live config
        // updates (such as a host theme change) must not hide it again.
        this.launcherThemeReady ||= config.hasFirstPaintLauncherColor;
        this.host.style.setProperty("--wpn-frame-background", theme.frameBackground);
        this.host.style.setProperty("--wpn-panel-shadow", theme.panelShadow);
        this.host.style.setProperty("--wpn-panel-border", theme.panelBorder);
        this.host.style.setProperty("--wpn-sidebar-shadow", theme.sidebarShadow);
        this.host.style.setProperty("--wpn-sidebar-width", `${config.sidebarWidth}px`);
        this.host.setAttribute("data-wpn-presentation", config.presentationMode);
        if (config.sidebarResizable) {
            this.host.setAttribute("data-wpn-sidebar-resizable", "");
        } else {
            this.host.removeAttribute("data-wpn-sidebar-resizable");
        }
        this.configureResponsivePresentation();
        this.syncSidebarResizeA11y();
        this.applyLauncherTheme({
            triggerColor: config.triggerColor,
            triggerIconColor: config.triggerIconColor,
            reveal: false,
        });
        if (this.shadowReady) {
            this.syncLauncherThemeVisibility();
            this.applyLauncherTheme({
                triggerColor: config.triggerColor,
                triggerIconColor: config.triggerIconColor,
                reveal: config.hasFirstPaintLauncherColor,
            });
        }
    }

    reset(): void {
        if (this.sidebarResizeSession) {
            this.finishSidebarResize(this.sidebarResizeSession.pointerId, false);
        }
        this.disconnectPresentationObserver();
        this.iframe = undefined;
        this.panel = undefined;
        this.launcher = undefined;
        this.sidebarResizer = undefined;
        this.shadowReady = false;
        this.launcherThemeReady = false;
        this.launcherEnabled = true;
        this.developmentMode = false;
        this.presentationMode = "popover";
        this.sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
        this.sidebarResizable = false;
        this.sidebarResizeSession = undefined;
        this.effectivePresentationMode = "popover";
        this.host.removeAttribute("data-wpn-dev");
        this.host.removeAttribute("data-wpn-presentation");
        this.host.removeAttribute("data-wpn-effective-presentation");
        this.host.removeAttribute("data-wpn-sidebar-resizable");
        this.host.removeAttribute("data-wpn-sidebar-resizing");
        this.host.style.removeProperty("--wpn-sidebar-width");
        this.host.style.removeProperty("--wpn-sidebar-shadow");
    }

    render(config: ResolvedConfig): void {
        const shadow = this.host.shadowRoot ?? this.host.attachShadow({ mode: "open" });
        // Validate before interpolating into the shadow <style> so a host-supplied
        // value cannot inject arbitrary CSS into the shadow root.
        const accent = isHexColor(config.triggerColor)
            ? config.triggerColor.trim()
            : DEFAULT_ACCENT;
        const iconColor = resolveLauncherIconColor(config.triggerIconColor) ?? "#ffffff";
        const theme = SHELL_THEME[config.theme];
        const title = config.title;
        this.syncLauncherThemeVisibility();
        const launcherHiddenAttribute =
            this.launcherEnabled && this.launcherThemeReady ? "" : " hidden";
        const microphoneAllowAttribute = config.voiceModeEnabled ? ' allow="microphone"' : "";
        shadow.innerHTML = [
            "<style>",
            // `all:initial` resets inherited host styles but NOT custom properties,
            // so the accent token survives for the color-mix shadows below.
            `:host{all:initial;display:block;inline-size:0;min-inline-size:0;block-size:0;--wpn-accent:${accent};--wpn-launcher-icon:${iconColor};--wpn-frame-background:${theme.frameBackground};--wpn-panel-shadow:${theme.panelShadow};--wpn-panel-border:${theme.panelBorder};--wpn-sidebar-shadow:${theme.sidebarShadow};--wpn-sidebar-width:${config.sidebarWidth}px;--wpn-dev:#e8a91d;}`,
            "*{box-sizing:border-box;}",
            // --- launcher: 60px accent circle, two-layer shadow ----------------
            "#launcher{position:fixed;right:24px;bottom:24px;width:60px;height:60px;border:0;",
            "border-radius:50%;background:var(--wpn-accent);color:var(--wpn-launcher-icon);cursor:pointer;",
            "display:grid;place-items:center;-webkit-tap-highlight-color:transparent;",
            "box-shadow:0 8px 24px -4px color-mix(in oklab,var(--wpn-accent) 35%,transparent),0 3px 8px rgba(22,18,42,.18);",
            "z-index:2147483000;transition:transform .18s cubic-bezier(.2,.7,.3,1),box-shadow .18s,background .18s;}",
            "#launcher[hidden],:host([launcher-theme-pending]) #launcher,:host([open]) #launcher{display:none;pointer-events:none;}",
            "#launcher:hover{transform:translateY(-2px) scale(1.04);",
            "box-shadow:0 14px 34px -6px color-mix(in oklab,var(--wpn-accent) 45%,transparent),0 5px 12px rgba(22,18,42,.22);}",
            "#launcher:focus-visible{outline:none;transform:translateY(-2px) scale(1.04);",
            "box-shadow:0 14px 34px -6px color-mix(in oklab,var(--wpn-accent) 45%,transparent),0 5px 12px rgba(22,18,42,.22),0 0 0 3px color-mix(in oklab,var(--wpn-accent) 25%,transparent);}",
            "#launcher .ic{display:grid;place-items:center;}",
            // --- development badge: amber ring + DEV pill on dev-mode surfaces --
            // Driven by the trusted token grant; makes a test embed unmistakable
            // without touching the launcher's own accent color or icon.
            "#launcher .dev-badge{display:none;}",
            // The ring is the launcher's own positioned ::after (auto z-index), so
            // the pill (z-index:1) paints on top and the ring passes behind it.
            ":host([data-wpn-dev]) #launcher::after{content:'';position:absolute;inset:-5px;",
            "border-radius:50%;border:3px solid var(--wpn-dev);pointer-events:none;}",
            ":host([data-wpn-dev]) #launcher .dev-badge{display:block;position:absolute;z-index:1;",
            "top:-1px;right:-20px;padding:2px 7px;border-radius:999px;",
            "background:var(--wpn-dev);color:#3a2a00;",
            "border:1px solid color-mix(in oklab,var(--wpn-dev) 62%,black);",
            "font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;",
            "font-size:9px;font-weight:800;line-height:1;letter-spacing:.08em;",
            "box-shadow:0 2px 4px rgba(22,18,42,.28);pointer-events:none;white-space:nowrap;}",
            // --- panel: frameless 384×640 rounded sheet ------------------------
            "#panel{position:fixed;right:24px;bottom:24px;width:384px;height:640px;",
            "max-width:calc(100vw - 40px);max-height:calc(100vh - 48px);background:var(--wpn-frame-background);",
            "border-radius:18px;overflow:hidden;display:flex;flex-direction:column;",
            "border:1px solid var(--wpn-panel-border);",
            "box-shadow:var(--wpn-panel-shadow);",
            "z-index:2147483000;transform-origin:bottom right;animation:wpn-in .16s cubic-bezier(.2,.7,.3,1);}",
            "#panel[hidden]{display:none;}",
            "iframe{border:0;flex:1 1 auto;width:100%;height:100%;display:block;background:var(--wpn-frame-background);}",
            "@keyframes wpn-in{from{opacity:0;transform:translateY(8px) scale(.96);}to{opacity:1;transform:none;}}",
            // --- sidebar: an in-flow final grid/flex child ---------------------
            // Docked to the viewport, not stretched to the document. `align-self:stretch`
            // handed the element its grid row's height, and a host row is normally as tall
            // as the page — so on a long page the panel became a 1600px column inside a
            // 900px window and the composer sat below the fold. Sticky + `100dvh` keeps the
            // whole chat on screen while the host content scrolls beside it; the
            // `max-block-size:100%` clamp means a mount that already has a definite height
            // (an app shell with its own scroll regions) still wins. `--wpn-sidebar-offset`
            // lets a host with a fixed header push the dock down past it.
            ":host([data-wpn-effective-presentation='sidebar']){position:sticky;",
            "inset-block-start:var(--wpn-sidebar-offset,0px);align-self:start;",
            "block-size:calc(100dvh - var(--wpn-sidebar-offset,0px));max-block-size:100%;}",
            ":host([data-wpn-effective-presentation='sidebar'][open]){inline-size:var(--wpn-sidebar-width);}",
            ":host([data-wpn-effective-presentation='sidebar']) #panel{position:relative;right:auto;bottom:auto;",
            "width:100%;height:100%;max-width:none;max-height:none;border-radius:0;",
            "border:0;border-inline-start:1px solid var(--wpn-panel-border);",
            "box-shadow:var(--wpn-sidebar-shadow);transform-origin:center;animation:none;z-index:auto;}",
            "#sidebar-resizer{display:none;}",
            ":host([data-wpn-effective-presentation='sidebar'][data-wpn-sidebar-resizable][open]) #sidebar-resizer{",
            "display:block;position:absolute;inset-block:0;inset-inline-start:0;inline-size:10px;",
            "z-index:2;cursor:col-resize;touch-action:none;outline:none;}",
            "#sidebar-resizer::before{content:'';position:absolute;inset-block-start:50%;inset-inline-start:1px;",
            "inline-size:3px;block-size:36px;border-radius:999px;background:var(--wpn-accent);",
            "opacity:.28;transform:translateY(-50%);transition:opacity .14s,transform .14s;}",
            "#sidebar-resizer:hover::before,#sidebar-resizer:focus-visible::before,",
            ":host([data-wpn-sidebar-resizing]) #sidebar-resizer::before{opacity:.68;",
            "transform:translateY(-50%) scaleY(1.08);}",
            "#sidebar-resizer:focus-visible::before,",
            ":host([data-wpn-sidebar-resizing]) #sidebar-resizer::before{opacity:1;}",
            ":host([data-wpn-sidebar-resizing]) iframe{pointer-events:none;user-select:none;}",
            // mobile: the panel fills the viewport.
            "@media (max-width:480px){#panel{right:0;bottom:0;width:100vw;height:100dvh;",
            "max-width:100vw;max-height:100dvh;border-radius:0;border:0;}#launcher{right:16px;bottom:16px;}}",
            "@media (prefers-reduced-motion:reduce){#panel{animation:none;}#launcher,#sidebar-resizer::before{transition:none;}}",
            "</style>",
            `<button id="launcher" part="launcher" type="button" aria-label="Open assistant"${launcherHiddenAttribute}>`,
            `  <span class="ic ic-chat">${LAUNCHER_CHAT_SVG}</span>`,
            '  <span class="dev-badge" aria-hidden="true">DEV</span>',
            "</button>",
            `<div id="panel" role="dialog" aria-modal="false" aria-label="${escapeAttr(title)}" hidden>`,
            `  <div id="sidebar-resizer" role="separator" aria-label="Resize assistant sidebar" aria-orientation="vertical" aria-valuemin="${SIDEBAR_WIDTH_MIN}" aria-valuemax="${SIDEBAR_WIDTH_MAX}" aria-valuenow="${config.sidebarWidth}" tabindex="0"></div>`,
            `  <iframe id="frame" title="${escapeAttr(title)}"${microphoneAllowAttribute}></iframe>`,
            "</div>",
        ].join("");

        this.iframe = shadow.getElementById("frame") as HTMLIFrameElement;
        this.iframe.src = config.iframeSrc;
        this.panel = shadow.getElementById("panel") ?? undefined;
        this.launcher = (shadow.getElementById("launcher") as HTMLButtonElement) ?? undefined;
        this.sidebarResizer = shadow.getElementById("sidebar-resizer") ?? undefined;
        this.syncLauncherThemeVisibility();
        this.syncDevelopmentMode();
        this.syncPanelSemantics();
        this.syncSidebarResizeA11y();

        if (this.launcher) {
            // Shadow-DOM activation events are composed. Contain the whole
            // sequence, not just click: host drawers commonly dismiss on
            // pointerdown/mousedown before the synthesized click is emitted.
            for (const eventName of LAUNCHER_ACTIVATION_EVENTS) {
                this.launcher.addEventListener(eventName, (event) => event.stopPropagation());
            }
            this.launcher.addEventListener("click", (event) => {
                event.stopPropagation();
                this.host.toggle();
            });
        }
        this.sidebarResizer?.addEventListener("pointerdown", this.onSidebarResizePointerDown);
        this.sidebarResizer?.addEventListener("pointermove", this.onSidebarResizePointerMove);
        this.sidebarResizer?.addEventListener("pointerup", this.onSidebarResizePointerUp);
        this.sidebarResizer?.addEventListener("pointercancel", this.onSidebarResizePointerCancel);
        this.sidebarResizer?.addEventListener(
            "lostpointercapture",
            this.onSidebarResizeLostPointerCapture,
        );
        this.sidebarResizer?.addEventListener("keydown", this.onSidebarResizeKeyDown);
        if (this.host.hasAttribute("open")) this.setOpen(true);

        this.shadowReady = true;
    }

    setOpen(isOpen: boolean): void {
        if (this.panel) this.panel.hidden = !isOpen;
        this.syncLauncherThemeVisibility();
        this.updateLauncherLabel();
    }

    private inlineResizeDirection(): 1 | -1 {
        if (
            typeof getComputedStyle === "function" &&
            getComputedStyle(this.host).direction === "rtl"
        ) {
            return 1;
        }
        return -1;
    }

    private sidebarResizeMax(): number {
        const availableWidth =
            this.observedContainer?.getBoundingClientRect().width ??
            this.host.parentElement?.getBoundingClientRect().width ??
            0;
        if (availableWidth <= 0) return SIDEBAR_WIDTH_MAX;
        return Math.max(
            SIDEBAR_WIDTH_MIN,
            Math.min(SIDEBAR_WIDTH_MAX, availableWidth - MIN_SIDEBAR_MAIN_CONTENT_WIDTH),
        );
    }

    private applyUserSidebarWidth(width: number): boolean {
        const next = Math.min(
            Math.max(Math.round(width), SIDEBAR_WIDTH_MIN),
            this.sidebarResizeMax(),
        );
        if (next === this.sidebarWidth) return false;
        this.sidebarWidth = next;
        this.host.style.setProperty("--wpn-sidebar-width", `${next}px`);
        this.syncEffectivePresentation();
        this.syncSidebarResizeA11y();
        return true;
    }

    private listenForSidebarResize(): void {
        if (typeof window === "undefined") return;
        window.addEventListener("pointermove", this.onSidebarResizePointerMove);
        window.addEventListener("pointerup", this.onSidebarResizePointerUp);
        window.addEventListener("pointercancel", this.onSidebarResizePointerCancel);
    }

    private stopListeningForSidebarResize(): void {
        if (typeof window === "undefined") return;
        window.removeEventListener("pointermove", this.onSidebarResizePointerMove);
        window.removeEventListener("pointerup", this.onSidebarResizePointerUp);
        window.removeEventListener("pointercancel", this.onSidebarResizePointerCancel);
    }

    private finishSidebarResize(pointerId: number, emit: boolean): void {
        this.sidebarResizeSession = undefined;
        this.stopListeningForSidebarResize();
        this.host.removeAttribute("data-wpn-sidebar-resizing");
        if (this.sidebarResizer?.hasPointerCapture(pointerId)) {
            this.sidebarResizer.releasePointerCapture(pointerId);
        }
        if (emit) this.emitSidebarResize();
    }

    private emitSidebarResize(): void {
        this.host.dispatchEvent(
            new CustomEvent<SidebarResizeDetail>(SIDEBAR_RESIZE_EVENT, {
                bubbles: true,
                composed: true,
                detail: { width: this.sidebarWidth },
            }),
        );
    }

    private syncSidebarResizeA11y(): void {
        this.sidebarResizer?.setAttribute("aria-valuemin", String(SIDEBAR_WIDTH_MIN));
        this.sidebarResizer?.setAttribute("aria-valuemax", String(this.sidebarResizeMax()));
        this.sidebarResizer?.setAttribute("aria-valuenow", String(this.sidebarWidth));
    }

    private configureResponsivePresentation(): void {
        if (this.presentationMode !== "sidebar") {
            this.disconnectPresentationObserver();
            this.setEffectivePresentation("popover");
            return;
        }

        const container = this.host.parentElement ?? undefined;
        if (container !== this.observedContainer) {
            this.disconnectPresentationObserver();
            this.observedContainer = container;
            if (container && typeof ResizeObserver !== "undefined") {
                this.resizeObserver = new ResizeObserver(this.onContainerResize);
                this.resizeObserver.observe(container);
            } else if (typeof window !== "undefined") {
                window.addEventListener("resize", this.onWindowResize);
                this.resizeFallbackActive = true;
            }
        }
        this.syncEffectivePresentation();
    }

    private syncEffectivePresentation(observedWidth?: number): void {
        if (this.presentationMode !== "sidebar") {
            this.setEffectivePresentation("popover");
            return;
        }
        const availableWidth =
            observedWidth ?? this.observedContainer?.getBoundingClientRect().width ?? 0;
        const canDock = availableWidth >= this.sidebarWidth + MIN_SIDEBAR_MAIN_CONTENT_WIDTH;
        this.setEffectivePresentation(canDock ? "sidebar" : "popover");
        this.syncSidebarResizeA11y();
    }

    private setEffectivePresentation(mode: ResolvedConfig["presentationMode"]): void {
        if (
            this.effectivePresentationMode === mode &&
            this.host.getAttribute("data-wpn-effective-presentation") === mode
        ) {
            return;
        }
        this.effectivePresentationMode = mode;
        this.host.setAttribute("data-wpn-effective-presentation", mode);
        this.syncPanelSemantics();
    }

    private syncPanelSemantics(): void {
        if (!this.panel) return;
        if (this.effectivePresentationMode === "sidebar") {
            this.panel.setAttribute("role", "complementary");
            this.panel.removeAttribute("aria-modal");
        } else {
            this.panel.setAttribute("role", "dialog");
            this.panel.setAttribute("aria-modal", "false");
        }
    }

    private disconnectPresentationObserver(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;
        if (this.resizeAnimationFrame != null && typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(this.resizeAnimationFrame);
        }
        this.resizeAnimationFrame = undefined;
        if (this.resizeFallbackActive && typeof window !== "undefined") {
            window.removeEventListener("resize", this.onWindowResize);
        }
        this.resizeFallbackActive = false;
        this.observedContainer = undefined;
    }

    /** Reflect development state on the launcher's accessible name. */
    private updateLauncherLabel(): void {
        const base = "Open assistant";
        this.launcher?.setAttribute(
            "aria-label",
            this.developmentMode ? `${base} (development surface)` : base,
        );
    }

    /**
     * Mark the launcher as a development-mode surface: an amber ring + "DEV" pill
     * make a test embed unmistakable. Driven by the trusted token grant, so it
     * appears once the embedded session is established — it never overrides the
     * surface's own accent color or launcher icon.
     */
    setDevelopmentMode(developmentMode: boolean): void {
        if (this.developmentMode === developmentMode) return;
        this.developmentMode = developmentMode;
        this.syncDevelopmentMode();
    }

    /** Reflect `developmentMode` onto the host attribute the badge CSS keys off. */
    private syncDevelopmentMode(): void {
        if (this.developmentMode) this.host.setAttribute("data-wpn-dev", "");
        else this.host.removeAttribute("data-wpn-dev");
        this.updateLauncherLabel();
    }

    /** Applies validated surface launcher theme tokens without rebuilding the iframe. */
    private applyLauncherTheme(theme: {
        accent?: string | null;
        triggerColor?: string | null;
        triggerIconColor?: string | null;
        reveal?: boolean;
    }): void {
        const color = theme.triggerColor || theme.accent;
        if (color && isHexColor(color)) {
            this.host.style.setProperty("--wpn-accent", color.trim());
        }

        const iconColor = resolveLauncherIconColor(theme.triggerIconColor);
        if (iconColor) {
            this.host.style.setProperty("--wpn-launcher-icon", iconColor);
        }

        if (theme.reveal) {
            this.revealLauncherTheme();
        }
    }

    /**
     * Surface display settings are trusted, but host-supplied launcher colors are
     * authoritative for the SDK-owned launcher. Use surface colors only when the
     * host did not configure a first-paint launcher color.
     */
    applySurfaceLauncherTheme(theme: {
        accent?: string | null;
        triggerColor?: string | null;
        triggerIconColor?: string | null;
        reveal?: boolean;
    }): void {
        if (this.hostConfiguredLauncherColor) {
            if (theme.reveal) {
                this.revealLauncherTheme();
            }
            return;
        }

        this.applyLauncherTheme(theme);
    }

    private syncLauncherThemeVisibility(): void {
        if (this.launcherThemeReady) this.host.removeAttribute("launcher-theme-pending");
        else this.host.setAttribute("launcher-theme-pending", "");
        if (this.launcher) {
            this.launcher.hidden =
                !this.launcherEnabled || !this.launcherThemeReady || this.host.hasAttribute("open");
        }
    }

    revealLauncherTheme(): void {
        this.launcherThemeReady = true;
        this.syncLauncherThemeVisibility();
    }
}
