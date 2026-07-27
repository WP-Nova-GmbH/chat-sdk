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

import { fetchToken } from "../../auth/token.js";
import { type ResolvedConfig, resolveConfig } from "../../config/config.js";
import { executeNavigation, isNavigationAction } from "../../page/navigation/index.js";
import { DEFAULT_SETTLE } from "../../page/settle.js";
import { capturePageContext, clearHandleStamps } from "../../page/snapshot/index.js";
import { Bridge } from "../../protocol/bridge/index.js";
import type {
    ClientToolCall,
    ClientToolResult,
    PageContext,
    SdkConfig,
    TokenResult,
} from "../../protocol/types/index.js";
import { ToolRegistry } from "../../tools/tools.js";
import { ChatShell } from "./shell.js";
import { TokenTimers } from "./token-timers.js";

/** Tag name of the custom element. */
export const ELEMENT_TAG = "wp-nova-chat";

/** Emitted after the SDK panel transitions between its open and closed states. */
export const OPEN_CHANGE_EVENT = "wp-nova:open-change";

export interface OpenChangeDetail {
    open: boolean;
}

export class WpNovaChatElement extends HTMLElement {
    private resolved?: ResolvedConfig;
    private registry = new ToolRegistry();
    private bridge?: Bridge;
    private readonly shell = new ChatShell(this);
    private readonly tokenTimers = new TokenTimers();
    private iframeReady = false;
    private booting = false;
    private tokenRequestId = 0;

    static get observedAttributes(): string[] {
        return ["open", "title", "accent"];
    }

    /** Apply config object (from WpNova('init')) — alternative to attributes. */
    setConfig(config: SdkConfig): void {
        const next = resolveConfig(config);
        const current = this.resolved;
        const requiresFrameReset = current ? this.requiresFrameReset(current, next) : false;
        const tokenEndpointChanged = current?.tokenEndpoint !== next.tokenEndpoint;
        if (requiresFrameReset) {
            this.resetFrame();
        }
        this.resolved = next;
        this.shell.applyConfig(next);
        if (current && current.theme !== next.theme && this.iframeReady) {
            this.bridge?.sendHostTheme(next.theme);
        }
        if (!this.isConnected) return;

        // Initial mount and iframe/protocol changes need the full boot path.
        // Other live config changes reuse the current frame and bridge; only an
        // auth-endpoint change needs a new token acquisition.
        if (!current || requiresFrameReset || !this.shell.rendered || !this.bridge) {
            this.boot();
        } else if (tokenEndpointChanged) {
            void this.acquireToken();
        }
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
        this.tokenTimers.clear();
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (name !== "open" || oldValue === newValue) return;
        const open = this.hasAttribute("open");
        this.shell.setOpen(open);
        this.dispatchEvent(
            new CustomEvent<OpenChangeDetail>(OPEN_CHANGE_EVENT, {
                bubbles: true,
                composed: true,
                detail: { open },
            }),
        );
    }

    get isOpen(): boolean {
        return this.hasAttribute("open");
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
        this.close();
        this.teardownFrame();
        this.remove();
    }

    /**
     * Tear down the iframe + bridge + timers + buffered auth and unstamp the host
     * DOM. Shared by destroy() (which also detaches the element) and resetFrame()
     * (which keeps the element so a fresh config can re-boot it).
     */
    private teardownFrame(): void {
        this.tokenTimers.clear();
        this.bridge?.stop();
        this.bridge = undefined;
        this.shell.reset();
        this.iframeReady = false;
        this.booting = false;
        this.tokenRequestId++;
        this.lastAuth = undefined;
        clearHandleStamps();
    }

    /** Idempotent boot: render the shell once, wire the bridge, fetch the token. */
    private boot(): void {
        if (!this.resolved || this.booting) return;
        this.booting = true;
        try {
            if (!this.shell.rendered) this.shell.render(this.resolved);
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
        this.teardownFrame();
    }

    /** Construct the bridge + register the registry-change → REGISTER_TOOLS hook. */
    private wireBridge(config: ResolvedConfig): void {
        const bridge = new Bridge(config, {
            // Capture is synchronous; a throw is mapped to a capture_error frame.
            onSnapshotRequest: () =>
                this.withSiteRoutes(capturePageContext(this.resolved?.safeValueSelectors ?? [])),
            onClientToolRequest: (call, signal) => this.runClientTool(call, signal),
            onAuthExpired: () => void this.acquireToken(),
            // The iframe-owned header's ⌄ control closes the SDK-owned panel.
            onMinimize: () => this.close(),
            onSurfaceTheme: (theme) => {
                this.shell.applySurfaceLauncherTheme({ ...theme, reveal: true });
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
                // Establish host color mode before auth renders the conversation,
                // then push buffered auth and the current SDK-declared tools.
                bridge.sendHostTheme(this.resolved?.theme ?? config.theme);
                this.pushAuthState();
                bridge.sendRegisterTools(this.registry.advertisedTools());
                return true;
            },
        });
        bridge.setIframeWindow(this.shell.frame?.contentWindow ?? null);
        // Re-send REGISTER_TOOLS whenever the registry changes.
        this.registry.setOnChange((tools) => {
            if (this.iframeReady) bridge.sendRegisterTools(tools);
        });
        this.bridge = bridge;
        // contentWindow may not exist until the iframe has navigated; re-bind on load.
        this.shell.frame?.addEventListener("load", () => {
            bridge.setIframeWindow(this.shell.frame?.contentWindow ?? null);
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

    /**
     * Attach the integrator-declared site routes to a captured page context.
     * Applied at the element (the one owner of the resolved config) so every
     * capture path — snapshot requests and post-tool snapshots — carries them.
     */
    private withSiteRoutes(context: PageContext): PageContext {
        const siteRoutes = this.resolved?.siteRoutes;
        return siteRoutes?.length ? { ...context, siteRoutes } : context;
    }

    /** Dispatch a client tool to the navigation executor or the integrator registry. */
    private async runClientTool(
        call: ClientToolCall,
        signal?: AbortSignal,
    ): Promise<ClientToolResult> {
        const safeSelectors = this.resolved?.safeValueSelectors ?? [];
        const settle = this.resolved?.settle ?? DEFAULT_SETTLE;
        const result = isNavigationAction(call.name)
            ? await executeNavigation(call, safeSelectors, signal, settle)
            : await this.registry.run(call, safeSelectors, signal, settle);
        return result.snapshot
            ? { ...result, snapshot: this.withSiteRoutes(result.snapshot) }
            : result;
    }

    /**
     * The latest typed auth outcome (granted / unavailable / error), buffered so
     * it can be (re-)pushed to the iframe on READY. A single field replaces the
     * four mutually-exclusive token/displaySettings/unavailable/error mirrors.
     */
    private lastAuth?: TokenResult;

    /** Push the buffered auth outcome to a ready iframe via the matching frame. */
    private pushAuthState(): void {
        const auth = this.lastAuth;
        if (!auth || !this.iframeReady || !this.bridge) return;
        if (auth.kind === "granted") {
            this.bridge.sendAuthToken(auth.token, auth.displaySettings ?? null);
        } else if (auth.kind === "unavailable") {
            this.bridge.sendUnavailable(
                auth.email,
                auth.message,
                auth.accessRequestToken,
                auth.accessRequestExpiresIn,
                auth.messageIsCustom,
            );
        } else {
            this.bridge.sendAuthError(auth.message);
        }
    }

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
        this.tokenTimers.clearErrorRetry();
        const result = await fetchToken(config);
        if (requestId !== this.tokenRequestId || this.resolved !== config) return;
        this.lastAuth = result;
        if (result.kind === "granted") {
            this.shell.applySurfaceLauncherTheme({
                accent: result.displaySettings?.accent,
                triggerColor: result.displaySettings?.triggerColor,
                triggerIconColor: result.displaySettings?.triggerIconColor,
                reveal: true,
            });
            this.shell.setDevelopmentMode(result.developmentMode === true);
            this.pushAuthState();
            this.tokenTimers.armRefresh(result.expiresIn, () => void this.acquireToken());
        } else if (result.kind === "unavailable") {
            // AC4: forward the unavailable-user state so the iframe renders it
            // (no token, no thread/message). Buffered until READY in onReady.
            this.shell.revealLauncherTheme();
            this.tokenTimers.clearRefresh();
            this.pushAuthState();
        } else {
            this.shell.revealLauncherTheme();
            this.pushAuthState();
            this.tokenTimers.armErrorRetry(() => void this.acquireToken());
        }
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
