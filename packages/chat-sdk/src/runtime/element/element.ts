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
import { IGNORE_ATTR } from "../../page/snapshot/constants.js";
import { capturePageContext, clearHandleStamps } from "../../page/snapshot/index.js";
import { matchingPageWorkflow } from "../../page/workflows.js";
import { Bridge } from "../../protocol/bridge/index.js";
import type {
    ClientToolCall,
    ClientToolResult,
    PageContext,
    PageWorkflowDefinition,
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

interface PageWorkflowAttempt {
    correlationId: string;
    expectedUrl: string;
    workflow: PageWorkflowDefinition;
    openSequence: number;
    status: "sent" | "started" | "finished";
    lastSentLoadSequence: number;
    ackRetries: number;
}

let workflowCorrelationSequence = 0;
const WORKFLOW_ACK_TIMEOUT_MS = 5_000;
const WORKFLOW_MAX_ACK_RETRIES = 2;

export class WpNovaChatElement extends HTMLElement {
    private resolved?: ResolvedConfig;
    private registry = new ToolRegistry();
    private bridge?: Bridge;
    private readonly shell = new ChatShell(this);
    private readonly tokenTimers = new TokenTimers();
    private iframeReady = false;
    private pageWorkflowCapable = false;
    private pageReadyUrl?: string;
    private pageWorkflowAttempt?: PageWorkflowAttempt;
    private pageWorkflowAckTimer?: ReturnType<typeof setTimeout>;
    private iframeLoadSequence = 0;
    private openSequence = 0;
    private booting = false;
    private tokenRequestId = 0;
    /** Suppresses disconnect/connect side effects while the controller reparents this node. */
    private relocating = false;

    static get observedAttributes(): string[] {
        return ["open", "title", "accent"];
    }

    /** Apply config object (from WpNova('init')) — alternative to attributes. */
    setConfig(config: SdkConfig): void {
        this.markSnapshotIgnored();
        const next = resolveConfig(config);
        this.registry.setSiteCapabilities(config.siteCapabilities);
        const current = this.resolved;
        const requiresFrameReset = current ? this.requiresFrameReset(current, next) : false;
        const tokenEndpointChanged = current?.tokenEndpoint !== next.tokenEndpoint;
        const pageWorkflowsChanged =
            JSON.stringify(current?.pageWorkflows ?? []) !== JSON.stringify(next.pageWorkflows);
        if (!requiresFrameReset && (pageWorkflowsChanged || tokenEndpointChanged)) {
            this.clearPageWorkflowAttempt(true);
        }
        if (tokenEndpointChanged) {
            // A grant minted by the old endpoint must never satisfy the workflow
            // auth gate while the replacement request is in flight.
            this.lastAuth = undefined;
            this.tokenTimers.clear();
        }
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
        this.maybeStartPageWorkflow();
    }

    /** Share the queued snippet's registry so pre-init handlers survive mount. */
    setRegistry(registry: ToolRegistry): void {
        this.registry = registry;
    }

    connectedCallback(): void {
        if (this.relocating) return;
        this.markSnapshotIgnored();
        // Singleton/idempotent: only boot once a config exists; re-connecting the
        // same node reuses the existing iframe + bridge (see boot()).
        if (this.resolved) this.boot();
    }

    disconnectedCallback(): void {
        if (this.relocating) return;
        // Keep the bridge listener + iframe alive across SPA re-mounts/HMR; tear
        // down timers (re-armed on the next AUTH_TOKEN / retry).
        this.tokenTimers.clear();
    }

    /**
     * Move the live singleton into a new host layout slot. Custom-element
     * disconnect/connect callbacks run synchronously during appendChild; the
     * relocation guard prevents those callbacks from disturbing timers or auth.
     */
    moveTo(target: HTMLElement): void {
        if (this.parentElement === target) return;
        this.relocating = true;
        try {
            target.appendChild(this);
        } finally {
            this.relocating = false;
        }
    }

    private markSnapshotIgnored(): void {
        // SDK chrome and the cross-origin iframe are never host-page tools or
        // context. This does not hide the complementary/dialog UI from AT.
        this.setAttribute(IGNORE_ATTR, "");
    }

    attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
        if (name !== "open" || oldValue === newValue) return;
        const open = this.hasAttribute("open");
        this.shell.setOpen(open);
        if (this.iframeReady) {
            this.bridge?.sendHostOpenState(open);
        }
        if (open) {
            this.openSequence++;
            this.maybeStartPageWorkflow();
        } else {
            this.cancelUnstartedPageWorkflow();
        }
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

    /**
     * Record whether the host's current route has finished rendering its data.
     * The exact URL is captured with the ready transition so later SPA
     * navigation cannot accidentally start a stale workflow. A readiness cycle
     * on the attempt's own URL (the host re-fetched its data, e.g. on window
     * refocus) keeps an in-flight attempt so its correlation stays stable and
     * the iframe's running card survives; only settled attempts re-evaluate.
     */
    setPageReady(ready: boolean, expectedUrl = location.href): void {
        if (!ready) {
            this.pageReadyUrl = undefined;
            this.cancelUnstartedPageWorkflow();
            return;
        }
        const attempt = this.pageWorkflowAttempt;
        if (attempt && attempt.expectedUrl !== expectedUrl) {
            this.clearPageWorkflowAttempt(true);
        } else if (attempt?.status === "finished" && this.pageReadyUrl === undefined) {
            this.clearPageWorkflowAttempt(false);
        }
        this.pageReadyUrl = expectedUrl;
        this.maybeStartPageWorkflow();
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
        this.pageWorkflowCapable = false;
        this.pageWorkflowAttempt = undefined;
        this.clearPageWorkflowAckTimer();
        this.iframeLoadSequence = 0;
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
            onSnapshotRequest: (workflowCorrelationId) => {
                if (
                    workflowCorrelationId &&
                    !this.isWorkflowSnapshotRequestValid(workflowCorrelationId)
                ) {
                    throw new Error(
                        "The automatic page workflow is no longer active for this page",
                    );
                }
                return this.withConfiguredPageContext(
                    capturePageContext(
                        this.resolved?.safeValueSelectors ?? [],
                        this.resolved?.hostLocale,
                    ),
                );
            },
            onClientToolRequest: (call, signal) => this.runClientTool(call, signal),
            onAuthExpired: () => void this.acquireToken(),
            // The iframe-owned header's ⌄ control closes the SDK-owned panel.
            onMinimize: () => this.close(),
            onSurfaceTheme: (theme) => {
                this.shell.applySurfaceLauncherTheme({ ...theme, reveal: true });
            },
            onReady: (minVersion, maxVersion, capabilities) => {
                if (!this.isProtocolCompatible(config, minVersion, maxVersion)) {
                    this.iframeReady = false;
                    this.pageWorkflowCapable = false;
                    console.error(
                        `[wp-nova] iframe protocol range ${minVersion ?? "?"}-${
                            maxVersion ?? "?"
                        } does not support SDK protocol ${config.protocolVersion}`,
                    );
                    return false;
                }
                this.iframeReady = true;
                this.pageWorkflowCapable = capabilities?.includes("page-workflows") === true;
                // Establish host color mode before auth renders the conversation,
                // then push buffered auth and the current SDK-declared tools.
                bridge.sendHostTheme(this.resolved?.theme ?? config.theme);
                bridge.sendHostOpenState(this.isOpen);
                this.pushAuthState();
                bridge.sendRegisterTools(this.registry.advertisedTools());
                const attempt = this.pageWorkflowAttempt;
                if (
                    attempt?.status === "sent" &&
                    attempt.lastSentLoadSequence !== this.iframeLoadSequence
                ) {
                    attempt.ackRetries = 0;
                    this.sendPageWorkflowAttempt(attempt);
                } else {
                    this.maybeStartPageWorkflow();
                }
                return true;
            },
            onPageWorkflowStatus: ({ correlationId, status }) =>
                this.handlePageWorkflowStatus(correlationId, status),
        });
        bridge.setIframeWindow(this.shell.frame?.contentWindow ?? null);
        // Re-send REGISTER_TOOLS whenever the registry changes.
        this.registry.setOnChange((tools) => {
            if (this.iframeReady) bridge.sendRegisterTools(tools);
        });
        this.bridge = bridge;
        // contentWindow may not exist until the iframe has navigated; re-bind on load.
        this.shell.frame?.addEventListener("load", () => this.handleIframeLoad(bridge));
    }

    /** Reset per-document negotiation and recover standalone workflow card state. */
    private handleIframeLoad(bridge: Bridge): void {
        this.iframeReady = false;
        this.pageWorkflowCapable = false;
        this.iframeLoadSequence++;
        this.clearPageWorkflowAckTimer();
        if (this.pageWorkflowAttempt && this.pageWorkflowAttempt.status !== "sent") {
            // The reloaded document lost the standalone result card. A new
            // correlation lets Nova restore it from its running/content cache
            // without cancelling or duplicating backend generation.
            this.clearPageWorkflowAttempt(false);
        }
        bridge.resetProtocolAcceptance();
        bridge.setIframeWindow(this.shell.frame?.contentWindow ?? null);
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

    /** Start the matching workflow once every fixed lifecycle gate is satisfied. */
    private maybeStartPageWorkflow(): void {
        const config = this.resolved;
        const expectedUrl = this.pageReadyUrl;
        if (
            !config ||
            !expectedUrl ||
            !this.isOpen ||
            !this.iframeReady ||
            !this.pageWorkflowCapable ||
            this.lastAuth?.kind !== "granted" ||
            this.pageWorkflowAttempt
        ) {
            return;
        }
        if (location.href !== expectedUrl) return;

        const workflow = matchingPageWorkflow(config.pageWorkflows, new URL(expectedUrl).pathname);
        if (!workflow) return;

        const correlationId = `pw_${Date.now().toString(36)}_${(++workflowCorrelationSequence).toString(36)}`;
        this.pageWorkflowAttempt = {
            correlationId,
            expectedUrl,
            workflow,
            openSequence: this.openSequence,
            status: "sent",
            lastSentLoadSequence: -1,
            ackRetries: 0,
        };
        this.sendPageWorkflowAttempt(this.pageWorkflowAttempt);
    }

    private handlePageWorkflowStatus(
        correlationId: string,
        status: "started" | "cached" | "completed" | "failed" | "skipped",
    ): void {
        const attempt = this.pageWorkflowAttempt;
        if (!attempt || attempt.correlationId !== correlationId) return;
        if (status === "started") {
            this.clearPageWorkflowAckTimer();
            attempt.status = "started";
        } else if (status === "cached" || status === "completed") {
            this.clearPageWorkflowAckTimer();
            attempt.status = "finished";
        } else {
            // Failed/skipped attempts are retried only after another lifecycle
            // edge (for example close → open or a new ready signal), never in a
            // tight continuously-open loop.
            this.clearPageWorkflowAttempt(false);
            if (this.isOpen && this.openSequence > attempt.openSequence) {
                this.maybeStartPageWorkflow();
            }
        }
    }

    /** Send or re-send one unacknowledged attempt using its stable correlation id. */
    private sendPageWorkflowAttempt(attempt: PageWorkflowAttempt): void {
        if (this.pageWorkflowAttempt !== attempt || attempt.status !== "sent") return;
        if (
            !this.isWorkflowSnapshotRequestValid(attempt.correlationId) ||
            !this.iframeReady ||
            !this.pageWorkflowCapable ||
            this.lastAuth?.kind !== "granted"
        ) {
            this.clearPageWorkflowAttempt(true);
            return;
        }
        attempt.lastSentLoadSequence = this.iframeLoadSequence;
        this.bridge?.sendStartPageWorkflow(
            attempt.correlationId,
            attempt.workflow,
            attempt.expectedUrl,
        );
        this.armPageWorkflowAckTimer(attempt);
    }

    /**
     * Retry a lost START/ack a bounded number of times. Reusing correlationId is
     * required: the iframe/backend can make every replay idempotent.
     */
    private armPageWorkflowAckTimer(attempt: PageWorkflowAttempt): void {
        this.clearPageWorkflowAckTimer();
        this.pageWorkflowAckTimer = setTimeout(() => {
            this.pageWorkflowAckTimer = undefined;
            if (
                this.pageWorkflowAttempt !== attempt ||
                attempt.status !== "sent" ||
                attempt.ackRetries >= WORKFLOW_MAX_ACK_RETRIES ||
                !this.isWorkflowSnapshotRequestValid(attempt.correlationId) ||
                !this.iframeReady ||
                !this.pageWorkflowCapable ||
                this.lastAuth?.kind !== "granted"
            ) {
                return;
            }
            attempt.ackRetries++;
            this.sendPageWorkflowAttempt(attempt);
        }, WORKFLOW_ACK_TIMEOUT_MS);
        (
            this.pageWorkflowAckTimer as unknown as {
                unref?: () => void;
            }
        ).unref?.();
    }

    private clearPageWorkflowAckTimer(): void {
        if (this.pageWorkflowAckTimer !== undefined) {
            clearTimeout(this.pageWorkflowAckTimer);
            this.pageWorkflowAckTimer = undefined;
        }
    }

    /** Cancel only work that Nova has not acknowledged as started. */
    private cancelUnstartedPageWorkflow(): void {
        if (this.pageWorkflowAttempt?.status === "sent") {
            this.clearPageWorkflowAttempt(true);
        }
    }

    /** Clear local lifecycle state, optionally withdrawing an unstarted trigger. */
    private clearPageWorkflowAttempt(sendCancellation: boolean): void {
        const attempt = this.pageWorkflowAttempt;
        if (sendCancellation && attempt?.status === "sent") {
            this.bridge?.sendCancelPageWorkflow(attempt.correlationId);
        }
        this.clearPageWorkflowAckTimer();
        this.pageWorkflowAttempt = undefined;
    }

    /** Workflow captures fail closed once page readiness, URL, or open state drifts. */
    private isWorkflowSnapshotRequestValid(correlationId: string): boolean {
        const attempt = this.pageWorkflowAttempt;
        return (
            attempt?.correlationId === correlationId &&
            attempt.status !== "finished" &&
            this.pageReadyUrl === attempt.expectedUrl &&
            location.href === attempt.expectedUrl &&
            this.isOpen
        );
    }

    /**
     * Attach the integrator-declared site routes to a captured page context.
     * Applied at the element (the one owner of the resolved config) so every
     * capture path — snapshot requests and post-tool snapshots — carries them.
     */
    private withConfiguredPageContext(context: PageContext): PageContext {
        const siteRoutes = this.resolved?.siteRoutes;
        const hostLocale = this.resolved?.hostLocale;
        if (!siteRoutes?.length && !hostLocale) return context;

        return {
            ...context,
            ...(siteRoutes?.length ? { siteRoutes } : {}),
            ...(hostLocale
                ? {
                      languageSignals: {
                          ...context.languageSignals,
                          hostLocale,
                      },
                  }
                : {}),
        };
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
            ? { ...result, snapshot: this.withConfiguredPageContext(result.snapshot) }
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
                auth.userCreationRequired,
                auth.userCreationToken,
                auth.userCreationExpiresIn,
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
            this.maybeStartPageWorkflow();
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
