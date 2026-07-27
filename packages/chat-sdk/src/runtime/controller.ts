import { resolveConfig } from "../config/config.js";
import { formatErrorMessage } from "../config/diagnostics.js";
import type { SdkConfig, ToolDefinition, ToolHandler } from "../protocol/types/index.js";
import { ToolRegistry } from "../tools/tools.js";
import {
    defineElement,
    ELEMENT_TAG,
    OPEN_CHANGE_EVENT,
    type OpenChangeDetail,
    type WpNovaChatElement,
} from "./element/index.js";

export type OpenChangeListener = (open: boolean) => void;

/** Commands the queued `WpNova(...)` dispatcher accepts. */
export type Command =
    | ["init", SdkConfig]
    | ["registerTool", ToolDefinition]
    | ["unregisterTool", string]
    | ["registerToolHandler", string, ToolHandler]
    | ["unregisterToolHandler", string]
    | ["open"]
    | ["close"]
    | ["toggle"]
    | ["retain"]
    | ["release"]
    | ["destroy"]
    | [string, ...unknown[]];

/** The callable + queue carried on `window.WpNova` before the CDN bundle loads. */
export interface QueuedWpNova {
    (...args: Command): void;
    /** Pre-load command queue set by the install snippet. */
    q?: Command[];
}

/**
 * Singleton SDK controller. A second init reuses the existing element rather
 * than mounting a second iframe. The registry lives here so handlers registered
 * before init are not lost when the custom element mounts.
 */
class SdkController {
    private readonly registry = new ToolRegistry();
    private element?: WpNovaChatElement;
    private openState = false;
    private hasPendingOpenState = false;
    private readonly openChangeListeners = new Set<OpenChangeListener>();
    /** Live mount count. The shared element is torn down only when it hits 0. */
    private mountRefs = 0;
    private readonly onElementOpenChange = (event: Event): void => {
        const detail = (event as CustomEvent<OpenChangeDetail>).detail;
        if (typeof detail?.open === "boolean") this.updateOpenState(detail.open);
    };

    dispatch = (...args: Command): void => {
        const [command, ...rest] = args;
        switch (command) {
            case "init":
                this.init(rest[0] as SdkConfig);
                break;
            case "registerTool":
                this.registry.register(rest[0] as ToolDefinition);
                break;
            case "unregisterTool":
                this.registry.unregister(rest[0] as string);
                break;
            case "registerToolHandler":
                this.registry.registerHandler(rest[0] as string, rest[1] as ToolHandler);
                break;
            case "unregisterToolHandler":
                this.registry.unregisterHandler(rest[0] as string);
                break;
            case "open":
                this.open();
                break;
            case "close":
                this.close();
                break;
            case "toggle":
                this.toggle();
                break;
            case "retain":
                this.retain();
                break;
            case "release":
                this.release();
                break;
            case "destroy":
                this.destroy();
                break;
            default:
                console.warn(`[wp-nova] unknown command: ${String(command)}`);
        }
    };

    open(): void {
        if (this.element) {
            this.element.open();
            return;
        }
        this.hasPendingOpenState = true;
        this.updateOpenState(true);
    }

    close(): void {
        if (this.element) {
            this.element.close();
            return;
        }
        this.hasPendingOpenState = true;
        this.updateOpenState(false);
    }

    toggle(): void {
        if (this.element?.isOpen ?? this.openState) this.close();
        else this.open();
    }

    isOpen(): boolean {
        return this.openState;
    }

    subscribeOpenChange(listener: OpenChangeListener): () => void {
        this.openChangeListeners.add(listener);
        return () => this.openChangeListeners.delete(listener);
    }

    /**
     * Register a live mount. Called once per mount lifecycle (NOT per `init`), so
     * repeated re-inits never disturb the count. Pairs with `release`.
     */
    retain(): void {
        this.mountRefs++;
    }

    /**
     * Drop a live mount. The shared element is only destroyed once the last
     * mount releases, so one wrapper unmounting never kills another's live chat.
     */
    release(): void {
        if (this.mountRefs > 0) this.mountRefs--;
        if (this.mountRefs === 0) this.destroy();
    }

    private init(config: SdkConfig): void {
        try {
            assertBrowserRuntime();
            const resolved = resolveConfig(config);
            const mountTarget = this.resolveMountTarget(config, resolved.presentationMode);
            defineElement();

            if (!this.element) {
                const existing = document.querySelector(ELEMENT_TAG) as WpNovaChatElement | null;
                const element =
                    existing ?? (document.createElement(ELEMENT_TAG) as WpNovaChatElement);
                element.setRegistry(this.registry);
                element.addEventListener(OPEN_CHANGE_EVENT, this.onElementOpenChange);
                element.moveTo(mountTarget);
                element.setConfig(config);
                this.element = element;
                if (this.hasPendingOpenState) {
                    if (this.openState) element.open();
                    else element.close();
                    this.hasPendingOpenState = false;
                } else {
                    this.updateOpenState(element.isOpen);
                }
                return;
            }

            this.element.moveTo(mountTarget);
            this.element.setConfig(config);
        } catch (error) {
            console.error(`[wp-nova] chat launcher was not mounted: ${formatErrorMessage(error)}`);
            throw error;
        }
    }

    private destroy(): void {
        const element = this.element;
        element?.destroy();
        element?.removeEventListener(OPEN_CHANGE_EVENT, this.onElementOpenChange);
        this.element = undefined;
        this.hasPendingOpenState = false;
        this.updateOpenState(false);
    }

    private updateOpenState(open: boolean): void {
        if (this.openState === open) return;
        this.openState = open;
        for (const listener of this.openChangeListeners) {
            try {
                listener(open);
            } catch (error) {
                console.error(`[wp-nova] open-state listener failed: ${formatErrorMessage(error)}`);
            }
        }
    }

    private resolveMountTarget(
        config: SdkConfig,
        presentationMode: "popover" | "sidebar",
    ): HTMLElement {
        const mount = config.mount;
        let target: HTMLElement | null = null;
        if (typeof mount === "string") {
            target = document.querySelector(mount);
        } else if (typeof HTMLElement !== "undefined" && mount instanceof HTMLElement) {
            target = mount;
        }

        if (presentationMode === "sidebar") {
            if (mount == null) {
                throw new Error(
                    "[wp-nova] sidebar presentation requires an explicit `mount` layout container",
                );
            }
            if (!target) {
                const description =
                    typeof mount === "string" ? ` selector ${JSON.stringify(mount)}` : "";
                throw new Error(
                    `[wp-nova] sidebar presentation could not resolve its \`mount\`${description}`,
                );
            }
            return target;
        }

        // Keep the original pop-over behavior: an omitted or unresolved mount
        // falls back to body.
        return target ?? document.body;
    }
}

const GLOBAL_KEY = "__wpNovaController__";

function assertBrowserRuntime(): void {
    if (typeof window === "undefined" || typeof document === "undefined") {
        throw new Error("[wp-nova] the chat SDK can only be initialized in a browser runtime");
    }
}

function getController(): SdkController {
    const globalScope = globalThis as unknown as Record<string, SdkController | undefined>;
    let controller = globalScope[GLOBAL_KEY];
    if (!controller) {
        controller = new SdkController();
        globalScope[GLOBAL_KEY] = controller;
    }
    return controller;
}

/** The public callable: `WpNova("init", ...)` / `WpNova("registerTool", ...)`. */
export function WpNova(...args: Command): void {
    getController().dispatch(...args);
}

/** Programmatic helper for npm consumers who prefer typed calls. */
export function init(config: SdkConfig): void {
    WpNova("init", config);
}

export function registerTool(tool: ToolDefinition): void {
    WpNova("registerTool", tool);
}

export function unregisterTool(name: string): void {
    WpNova("unregisterTool", name);
}

/** @deprecated Use registerTool so the agent receives the tool spec and handler together. */
export function registerToolHandler(name: string, handler: ToolHandler): void {
    WpNova("registerToolHandler", name, handler);
}

/** @deprecated Use unregisterTool for SDK-declared tools. */
export function unregisterToolHandler(name: string): void {
    WpNova("unregisterToolHandler", name);
}

/** Open the shared chat panel. Safe to call before init; the state is applied on mount. */
export function open(): void {
    WpNova("open");
}

/** Close the shared chat panel without destroying its iframe or conversation. */
export function close(): void {
    WpNova("close");
}

/** Toggle the shared chat panel between open and closed. */
export function toggle(): void {
    WpNova("toggle");
}

/** Return the controller's current (or pre-init requested) open state. */
export function isOpen(): boolean {
    return getController().isOpen();
}

/** Subscribe to open-state transitions. Returns an unsubscribe callback. */
export function subscribeOpenChange(listener: OpenChangeListener): () => void {
    return getController().subscribeOpenChange(listener);
}

/**
 * Register a live mount of the shared chat element. Frameworks call this once per
 * mount lifecycle; pair every `retain()` with a `release()`.
 */
export function retain(): void {
    WpNova("retain");
}

/**
 * Drop a live mount. The shared element is torn down only when the last mount
 * releases, so unmounting one instance never destroys another's live chat.
 */
export function release(): void {
    WpNova("release");
}

export function destroy(): void {
    WpNova("destroy");
}

/**
 * Script-tag boot: define the element, install the real dispatcher onto
 * `window.WpNova`, and drain any commands buffered by the install snippet.
 */
export function installGlobal(): void {
    if (typeof window === "undefined") return;
    defineElement();

    const w = window as unknown as { WpNova?: QueuedWpNova };
    const queued = w.WpNova?.q ? w.WpNova.q.slice() : [];

    const dispatcher = WpNova as QueuedWpNova;
    dispatcher.q = [];
    w.WpNova = dispatcher;

    for (const command of queued) {
        WpNova(...command);
    }
}
