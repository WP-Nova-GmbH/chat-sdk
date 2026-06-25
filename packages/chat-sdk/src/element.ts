// The <wp-nova-chat> custom element: a Shadow-DOM shell that mounts the
// Nova-hosted iframe (<baseUrl>/embed/chat) and owns the token lifecycle.
//
// Responsibilities:
//   - Render a Shadow-DOM launcher + panel (host CSS can't bleed in) and an
//     iframe pointed at the validated iframe src.
//   - Wire a `Bridge` to service REQUEST_SNAPSHOT / CLIENT_TOOL_REQUEST /
//     AUTH_EXPIRED and to push AUTH_TOKEN + REGISTER_TOOLS on READY.
//   - Own the auth lifecycle: fetch the token from the customer's tokenEndpoint,
//     re-push on AUTH_EXPIRED, and re-mint PROACTIVELY at ~80% of expires_in.
//   - Distinguish the unavailable-user state from a transport error (typed).
//
// Mount lifecycle (SPA-safe): the connected element is a singleton. Re-connecting
// the same node (HMR / SPA re-mount) reuses the existing iframe + bridge instead
// of re-creating them; the bridge's global message listener is started once.

import { Bridge } from "./bridge.js";
import { type ResolvedConfig, resolveConfig } from "./config.js";
import { executeNavigation, isNavigationAction } from "./navigation.js";
import { capturePageContext } from "./snapshot.js";
import { fetchToken } from "./token.js";
import { ToolRegistry } from "./tools.js";
import type {
    ClientToolCall,
    ClientToolResult,
    SdkConfig,
    SurfaceDisplaySettings,
} from "./types.js";

/** Tag name of the custom element. */
export const ELEMENT_TAG = "wp-nova-chat";

/** Re-mint proactively at this fraction of the token's `expires_in`. */
const REFRESH_AT_FRACTION = 0.8;
/** Floor for the proactive re-mint timer so a tiny TTL doesn't tight-loop. */
const MIN_REFRESH_MS = 5_000;
/** Retry cadence after tokenEndpoint transport failures. */
const TOKEN_ERROR_RETRY_MS = 30_000;

/** Message-circle glyph used by the settings preview and SDK launcher. */
const LAUNCHER_CHAT_SVG =
    '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>';

/** Chevron-down shown in place of the chat glyph while the panel is open. */
const LAUNCHER_CHEVRON_SVG =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

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

export class WpNovaChatElement extends HTMLElement {
    private resolved?: ResolvedConfig;
    private registry = new ToolRegistry();
    private bridge?: Bridge;
    private iframe?: HTMLIFrameElement;
    private panel?: HTMLElement;
    private launcher?: HTMLButtonElement;
    private shadowReady = false;
    private iframeReady = false;
    private refreshTimer?: ReturnType<typeof setTimeout>;
    private errorRetryTimer?: ReturnType<typeof setTimeout>;
    private booting = false;
    private launcherThemeReady = false;
    private tokenRequestId = 0;

    static get observedAttributes(): string[] {
        return ["open", "title", "accent"];
    }

    /** Apply config object (from WpNova('init')) — alternative to attributes. */
    setConfig(config: SdkConfig): void {
        const next = resolveConfig(config);
        if (this.resolved && this.requiresFrameReset(this.resolved, next)) {
            this.resetFrame();
        }
        this.resolved = next;
        this.launcherThemeReady = next.hasFirstPaintLauncherColor;
        if (this.shadowReady) {
            if (!this.launcherThemeReady) {
                this.syncLauncherThemeVisibility();
            }
            this.applyLauncherTheme({
                triggerColor: next.triggerColor,
                triggerIconColor: next.triggerIconColor,
                reveal: next.hasFirstPaintLauncherColor,
            });
        }
        if (this.isConnected) this.boot();
    }

    /** Share the queued snippet's registry so pre-init handlers survive mount. */
    setRegistry(registry: ToolRegistry): void {
        this.registry = registry;
    }

    connectedCallback(): void {
        // Singleton/idempotent: only boot once a config exists; re-connecting the
        // same node reuses the existing iframe + bridge (see boot()).
        if (this.resolved) this.boot();
    }

    disconnectedCallback(): void {
        // Keep the bridge listener + iframe alive across SPA re-mounts/HMR; tear
        // down timers (re-armed on the next AUTH_TOKEN / retry).
        this.clearRefresh();
        this.clearErrorRetry();
    }

    attributeChangedCallback(name: string): void {
        if (name === "open") this.setOpen(this.hasAttribute("open"));
    }

    open(): void {
        this.setAttribute("open", "");
    }
    close(): void {
        this.removeAttribute("open");
    }
    toggle(): void {
        if (this.hasAttribute("open")) this.close();
        else this.open();
    }

    /** Explicit teardown used by framework wrappers and the public destroy command. */
    destroy(): void {
        this.clearRefresh();
        this.clearErrorRetry();
        this.bridge?.stop();
        this.bridge = undefined;
        this.iframe = undefined;
        this.panel = undefined;
        this.launcher = undefined;
        this.shadowReady = false;
        this.iframeReady = false;
        this.booting = false;
        this.tokenRequestId++;
        this.lastToken = undefined;
        this.lastDisplaySettings = undefined;
        this.lastUnavailable = undefined;
        this.lastAuthError = undefined;
        this.remove();
    }

    /** Idempotent boot: render the shell once, wire the bridge, fetch the token. */
    private boot(): void {
        if (!this.resolved || this.booting) return;
        this.booting = true;
        try {
            if (!this.shadowReady) this.render(this.resolved);
            if (!this.bridge) this.wireBridge(this.resolved);
            this.bridge?.start();
            void this.acquireToken();
        } finally {
            this.booting = false;
        }
    }

    private requiresFrameReset(current: ResolvedConfig, next: ResolvedConfig): boolean {
        return (
            current.iframeSrc !== next.iframeSrc ||
            current.iframeOrigin !== next.iframeOrigin ||
            current.protocolVersion !== next.protocolVersion
        );
    }

    private resetFrame(): void {
        this.clearRefresh();
        this.clearErrorRetry();
        this.bridge?.stop();
        this.bridge = undefined;
        this.iframe = undefined;
        this.panel = undefined;
        this.launcher = undefined;
        this.shadowReady = false;
        this.iframeReady = false;
        this.booting = false;
        this.tokenRequestId++;
        this.lastToken = undefined;
        this.lastDisplaySettings = undefined;
        this.lastUnavailable = undefined;
        this.lastAuthError = undefined;
    }

    /**
     * Render the Shadow-DOM shell + iframe. Runs at most once per node.
     *
     * The chrome mirrors the Nova "Chat-SDK · Launcher & Fenster" design: a
     * 60px accent launcher carrying the same chat glyph as the settings preview
     * (morphing to a chevron when open) and a frameless 384×640 rounded panel.
     * The panel renders NO header bar of its own — the Nova-hosted iframe owns
     * the full header (brand tile, online dot, history / new-chat / minimize),
     * so the iframe's ⌄ closes this panel over the MINIMIZE bridge frame. All
     * CSS lives in the Shadow DOM so host page styles cannot bleed in.
     */
    private render(config: ResolvedConfig): void {
        const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        const accent = config.triggerColor;
        const iconColor = resolveLauncherIconColor(config.triggerIconColor) ?? "#ffffff";
        const title = config.title;
        this.syncLauncherThemeVisibility();
        const launcherHiddenAttribute = this.launcherThemeReady ? "" : " hidden";
        shadow.innerHTML = [
            "<style>",
            // `all:initial` resets inherited host styles but NOT custom properties,
            // so the accent token survives for the color-mix shadows below.
            `:host{all:initial;--wpn-accent:${accent};--wpn-launcher-icon:${iconColor};}`,
            "*{box-sizing:border-box;}",
            // --- launcher: 60px accent circle, two-layer shadow ----------------
            "#launcher{position:fixed;right:24px;bottom:24px;width:60px;height:60px;border:0;",
            "border-radius:50%;background:var(--wpn-accent);color:var(--wpn-launcher-icon);cursor:pointer;",
            "display:grid;place-items:center;-webkit-tap-highlight-color:transparent;",
            "box-shadow:0 8px 24px -4px color-mix(in oklab,var(--wpn-accent) 35%,transparent),0 3px 8px rgba(22,18,42,.18);",
            "z-index:2147483000;transition:transform .18s cubic-bezier(.2,.7,.3,1),box-shadow .18s,background .18s;}",
            "#launcher[hidden],:host([launcher-theme-pending]) #launcher{display:none;pointer-events:none;}",
            "#launcher:hover{transform:translateY(-2px) scale(1.04);",
            "box-shadow:0 14px 34px -6px color-mix(in oklab,var(--wpn-accent) 45%,transparent),0 5px 12px rgba(22,18,42,.22);}",
            "#launcher:focus-visible{outline:none;transform:translateY(-2px) scale(1.04);",
            "box-shadow:0 14px 34px -6px color-mix(in oklab,var(--wpn-accent) 45%,transparent),0 5px 12px rgba(22,18,42,.22),0 0 0 3px color-mix(in oklab,var(--wpn-accent) 25%,transparent);}",
            // open: darken the launcher and swap the chat glyph for a chevron.
            ":host([open]) #launcher{background:color-mix(in oklab,var(--wpn-accent) 88%,black);}",
            "#launcher .ic{display:grid;place-items:center;}",
            "#launcher .ic-chev{display:none;}",
            ":host([open]) #launcher .ic-chat{display:none;}",
            ":host([open]) #launcher .ic-chev{display:grid;}",
            // --- panel: frameless 384×640 rounded sheet ------------------------
            "#panel{position:fixed;right:24px;bottom:100px;width:384px;height:640px;",
            "max-width:calc(100vw - 40px);max-height:calc(100vh - 124px);background:#fff;",
            "border-radius:18px;overflow:hidden;display:flex;flex-direction:column;",
            "box-shadow:0 1px 2px rgba(22,18,42,.05),0 22px 50px -18px rgba(22,18,42,.30);",
            "z-index:2147483000;transform-origin:bottom right;animation:wpn-in .16s cubic-bezier(.2,.7,.3,1);}",
            "#panel[hidden]{display:none;}",
            "iframe{border:0;flex:1 1 auto;width:100%;height:100%;display:block;background:#fff;}",
            "@keyframes wpn-in{from{opacity:0;transform:translateY(8px) scale(.96);}to{opacity:1;transform:none;}}",
            // mobile: the panel fills the viewport.
            "@media (max-width:480px){#panel{right:0;bottom:0;width:100vw;height:100dvh;",
            "max-width:100vw;max-height:100dvh;border-radius:0;}#launcher{right:16px;bottom:16px;}}",
            "@media (prefers-reduced-motion:reduce){#panel{animation:none;}#launcher{transition:none;}}",
            "</style>",
            `<button id="launcher" part="launcher" type="button" aria-label="Open assistant"${launcherHiddenAttribute}>`,
            `  <span class="ic ic-chat">${LAUNCHER_CHAT_SVG}</span>`,
            `  <span class="ic ic-chev">${LAUNCHER_CHEVRON_SVG}</span>`,
            "</button>",
            `<div id="panel" role="dialog" aria-modal="false" aria-label="${escapeAttr(title)}" hidden>`,
            `  <iframe id="frame" title="${escapeAttr(title)}"></iframe>`,
            "</div>",
        ].join("");

        this.iframe = shadow.getElementById("frame") as HTMLIFrameElement;
        this.iframe.src = config.iframeSrc;
        this.panel = shadow.getElementById("panel") ?? undefined;
        this.launcher = (shadow.getElementById("launcher") as HTMLButtonElement) ?? undefined;
        this.syncLauncherThemeVisibility();

        this.launcher?.addEventListener("click", () => this.toggle());
        if (this.hasAttribute("open")) this.setOpen(true);

        this.shadowReady = true;
    }

    private setOpen(isOpen: boolean): void {
        if (this.panel) this.panel.hidden = !isOpen;
        // Reflect the open state on the launcher for assistive tech.
        this.launcher?.setAttribute("aria-label", isOpen ? "Close assistant" : "Open assistant");
    }

    /** Construct the bridge + register the registry-change → REGISTER_TOOLS hook. */
    private wireBridge(config: ResolvedConfig): void {
        const bridge = new Bridge(config, {
            // Capture is synchronous; a throw is mapped to a capture_error frame.
            onSnapshotRequest: () => capturePageContext(this.resolved?.safeValueSelectors ?? []),
            onClientToolRequest: (call) => this.runClientTool(call),
            onAuthExpired: () => void this.acquireToken(),
            // The iframe-owned header's ⌄ control closes the SDK-owned panel.
            onMinimize: () => this.close(),
            onSurfaceTheme: (theme) => {
                this.applyLauncherTheme({ ...theme, reveal: true });
            },
            onReady: (minVersion, maxVersion) => {
                if (!this.isProtocolCompatible(config, minVersion, maxVersion)) {
                    this.iframeReady = false;
                    console.error(
                        `[wp-nova] iframe protocol range ${minVersion ?? "?"}-${
                            maxVersion ?? "?"
                        } does not support SDK protocol ${config.protocolVersion}`,
                    );
                    return false;
                }
                this.iframeReady = true;
                // Push the latest token (if any) and the current handler set; if the
                // session resolved to the unavailable-user state, forward that instead.
                if (this.lastToken) bridge.sendAuthToken(this.lastToken, this.lastDisplaySettings);
                else if (this.lastUnavailable)
                    bridge.sendUnavailable(
                        this.lastUnavailable.email,
                        this.lastUnavailable.message,
                    );
                else if (this.lastAuthError) bridge.sendAuthError(this.lastAuthError);
                bridge.sendRegisterTools(this.registry.names());
                return true;
            },
        });
        bridge.setIframeWindow(this.iframe?.contentWindow ?? null);
        // Re-send REGISTER_TOOLS whenever the registry changes.
        this.registry.setOnChange((names) => {
            if (this.iframeReady) bridge.sendRegisterTools(names);
        });
        this.bridge = bridge;
        // contentWindow may not exist until the iframe has navigated; re-bind on load.
        this.iframe?.addEventListener("load", () => {
            bridge.setIframeWindow(this.iframe?.contentWindow ?? null);
        });
    }

    private isProtocolCompatible(
        config: ResolvedConfig,
        minVersion?: number,
        maxVersion?: number,
    ): boolean {
        const min = minVersion ?? config.protocolVersion;
        const max = maxVersion ?? config.protocolVersion;
        return min <= config.protocolVersion && config.protocolVersion <= max;
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
            this.style.setProperty("--wpn-accent", color.trim());
        }

        const iconColor = resolveLauncherIconColor(theme.triggerIconColor);
        if (iconColor) {
            this.style.setProperty("--wpn-launcher-icon", iconColor);
        }

        if (theme.reveal) {
            this.revealLauncherTheme();
        }
    }

    private syncLauncherThemeVisibility(): void {
        if (this.launcherThemeReady) this.removeAttribute("launcher-theme-pending");
        else this.setAttribute("launcher-theme-pending", "");
        if (this.launcher) {
            this.launcher.hidden = !this.launcherThemeReady;
        }
    }

    private revealLauncherTheme(): void {
        this.launcherThemeReady = true;
        this.syncLauncherThemeVisibility();
    }

    /** Dispatch a client tool to the navigation executor or the integrator registry. */
    private runClientTool(call: ClientToolCall): Promise<ClientToolResult> {
        const safeSelectors = this.resolved?.safeValueSelectors ?? [];
        if (isNavigationAction(call.name)) {
            return executeNavigation(call, safeSelectors);
        }
        return this.registry.run(call, safeSelectors);
    }

    private lastToken?: string;
    private lastDisplaySettings?: SurfaceDisplaySettings | null;
    private lastUnavailable?: { email: string; message: string };
    private lastAuthError?: string;

    /**
     * Fetch a token from the customer's tokenEndpoint and act on the typed
     * outcome: push AUTH_TOKEN + arm the proactive re-mint timer on a grant,
     * forward the unavailable state, or surface a transport error. The iframe
     * renders the unavailable / error UI; the SDK renders nothing actionable.
     */
    private async acquireToken(): Promise<void> {
        const config = this.resolved;
        if (!config) return;
        const requestId = ++this.tokenRequestId;
        this.clearErrorRetry();
        const result = await fetchToken(config);
        if (requestId !== this.tokenRequestId || this.resolved !== config) return;
        if (result.kind === "granted") {
            this.lastToken = result.token;
            this.lastDisplaySettings = result.displaySettings ?? null;
            this.lastUnavailable = undefined;
            this.lastAuthError = undefined;
            this.applyLauncherTheme({
                accent: this.lastDisplaySettings?.accent,
                triggerColor: this.lastDisplaySettings?.triggerColor,
                triggerIconColor: this.lastDisplaySettings?.triggerIconColor,
                reveal: true,
            });
            if (this.iframeReady)
                this.bridge?.sendAuthToken(result.token, this.lastDisplaySettings);
            this.armRefresh(result.expiresIn);
        } else if (result.kind === "unavailable") {
            // AC4: forward the unavailable-user state so the iframe renders it
            // (no token, no thread/message). Buffered until READY in onReady.
            this.lastToken = undefined;
            this.lastDisplaySettings = undefined;
            this.lastUnavailable = { email: result.email, message: result.message };
            this.lastAuthError = undefined;
            this.revealLauncherTheme();
            this.clearRefresh();
            if (this.iframeReady) this.bridge?.sendUnavailable(result.email, result.message);
        } else {
            this.lastToken = undefined;
            this.lastDisplaySettings = undefined;
            this.lastUnavailable = undefined;
            this.lastAuthError = result.message;
            this.revealLauncherTheme();
            if (this.iframeReady) this.bridge?.sendAuthError(result.message);
            this.armErrorRetry();
        }
    }

    /** Arm proactive re-mint at ~80% of the token's TTL (floored). */
    private armRefresh(expiresInSec: number): void {
        this.clearRefresh();
        this.clearErrorRetry();
        const ms = Math.max(MIN_REFRESH_MS, Math.floor(expiresInSec * 1000 * REFRESH_AT_FRACTION));
        this.refreshTimer = setTimeout(() => void this.acquireToken(), ms);
    }

    /** Clear the proactive token refresh timer. */
    private clearRefresh(): void {
        if (!this.refreshTimer) return;
        clearTimeout(this.refreshTimer);
        this.refreshTimer = undefined;
    }

    /** Clear any pending transport-error retry. */
    private clearErrorRetry(): void {
        if (!this.errorRetryTimer) return;
        clearTimeout(this.errorRetryTimer);
        this.errorRetryTimer = undefined;
    }

    /** Retry token acquisition after fetchToken's own cooldown window. */
    private armErrorRetry(): void {
        this.clearErrorRetry();
        this.errorRetryTimer = setTimeout(() => {
            this.errorRetryTimer = undefined;
            void this.acquireToken();
        }, TOKEN_ERROR_RETRY_MS);
    }
}

/**
 * Define the custom element exactly once. Guards `customElements.get` so a
 * double-load (two script tags / HMR) does not throw on re-definition.
 */
export function defineElement(): void {
    if (typeof customElements === "undefined") return;
    if (!customElements.get(ELEMENT_TAG)) {
        customElements.define(ELEMENT_TAG, WpNovaChatElement);
    }
}
