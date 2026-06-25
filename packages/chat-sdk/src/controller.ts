import { resolveConfig } from "./config.js";
import { defineElement, ELEMENT_TAG, type WpNovaChatElement } from "./element.js";
import { ToolRegistry } from "./tools.js";
import type { SdkConfig, ToolHandler } from "./types.js";

/** Commands the queued `WpNova(...)` dispatcher accepts. */
export type Command =
    | ["init", SdkConfig]
    | ["registerToolHandler", string, ToolHandler]
    | ["unregisterToolHandler", string]
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

    dispatch = (...args: Command): void => {
        const [command, ...rest] = args;
        switch (command) {
            case "init":
                this.init(rest[0] as SdkConfig);
                break;
            case "registerToolHandler":
                this.registry.register(rest[0] as string, rest[1] as ToolHandler);
                break;
            case "unregisterToolHandler":
                this.registry.unregister(rest[0] as string);
                break;
            case "destroy":
                this.destroy();
                break;
            default:
                console.warn(`[wp-nova] unknown command: ${String(command)}`);
        }
    };

    private init(config: SdkConfig): void {
        assertBrowserRuntime();
        resolveConfig(config);
        defineElement();

        if (!this.element) {
            const existing = document.querySelector(ELEMENT_TAG) as WpNovaChatElement | null;
            const element = existing ?? (document.createElement(ELEMENT_TAG) as WpNovaChatElement);
            element.setRegistry(this.registry);
            if (!existing) this.mountInto(element, config.mount);
            element.setConfig(config);
            this.element = element;
            return;
        }

        this.element.setConfig(config);
    }

    private destroy(): void {
        this.element?.destroy();
        this.element = undefined;
    }

    private mountInto(element: HTMLElement, mount?: string | HTMLElement): void {
        let target: HTMLElement | null = document.body;
        if (typeof mount === "string") {
            target = document.querySelector(mount);
        } else if (typeof HTMLElement !== "undefined" && mount instanceof HTMLElement) {
            target = mount;
        }
        (target ?? document.body).appendChild(element);
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

/** The public callable: `WpNova("init", ...)` / `WpNova("registerToolHandler", ...)`. */
export function WpNova(...args: Command): void {
    getController().dispatch(...args);
}

/** Programmatic helper for npm consumers who prefer typed calls. */
export function init(config: SdkConfig): void {
    WpNova("init", config);
}

export function registerToolHandler(name: string, handler: ToolHandler): void {
    WpNova("registerToolHandler", name, handler);
}

export function unregisterToolHandler(name: string): void {
    WpNova("unregisterToolHandler", name);
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
