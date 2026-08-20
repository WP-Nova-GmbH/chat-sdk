import { __resetTokenCooldownForTests } from "../../auth/token.js";
import type { ResolvedConfig } from "../../config/config.js";
import type { WpNovaChatElement } from "./index.js";

export const ORIGINALS = {
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
    fetch: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
    setTimeout: Object.getOwnPropertyDescriptor(globalThis, "setTimeout"),
    clearTimeout: Object.getOwnPropertyDescriptor(globalThis, "clearTimeout"),
    CustomEvent: Object.getOwnPropertyDescriptor(globalThis, "CustomEvent"),
    ResizeObserver: Object.getOwnPropertyDescriptor(globalThis, "ResizeObserver"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
};

class FakeElement {
    hidden = false;
    src = "";
    contentWindow?: Window;
    private readonly attributes = new Map<string, string>();
    private readonly capturedPointers = new Set<number>();
    private readonly listeners = new Map<string, Array<(event: Event) => void>>();

    setAttribute(name: string, value = ""): void {
        this.attributes.set(name, value);
    }

    getAttribute(name: string): string | undefined {
        return this.attributes.get(name);
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }

    addEventListener(name: string, listener: (event: Event) => void): void {
        const existing = this.listeners.get(name) ?? [];
        existing.push(listener);
        this.listeners.set(name, existing);
    }

    dispatch(name: string, event: Event): void {
        for (const listener of this.listeners.get(name) ?? []) listener(event);
    }

    setPointerCapture(pointerId: number): void {
        this.capturedPointers.add(pointerId);
    }

    hasPointerCapture(pointerId: number): boolean {
        return this.capturedPointers.has(pointerId);
    }

    releasePointerCapture(pointerId: number): void {
        this.capturedPointers.delete(pointerId);
    }
}

class FakeShadowRoot {
    innerHTML = "";
    private readonly elements = new Map<string, FakeElement>();

    getElementById(id: string): FakeElement {
        const existing = this.elements.get(id);
        if (existing) return existing;

        const next = new FakeElement();
        this.elements.set(id, next);
        return next;
    }
}

class FakeHTMLElement {
    isConnected = false;
    parentElement: FakeHTMLElement | null = null;
    shadowRoot?: FakeShadowRoot;
    layoutWidth = 0;
    private readonly attributes = new Map<string, string>();
    private readonly listeners = new Map<string, Set<(event: Event) => void>>();
    private readonly styleProperties = new Map<string, string>();
    readonly style = {
        setProperty: (name: string, value: string) => this.styleProperties.set(name, value),
        removeProperty: (name: string) => this.styleProperties.delete(name),
        getPropertyValue: (name: string) => this.styleProperties.get(name) ?? "",
    };

    setAttribute(name: string, value = ""): void {
        const oldValue = this.attributes.get(name) ?? null;
        this.attributes.set(name, value);
        this.notifyAttributeChange(name, oldValue, value);
    }

    removeAttribute(name: string): void {
        const oldValue = this.attributes.get(name) ?? null;
        this.attributes.delete(name);
        if (oldValue !== null) this.notifyAttributeChange(name, oldValue, null);
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    addEventListener(name: string, listener: (event: Event) => void): void {
        const listeners = this.listeners.get(name) ?? new Set();
        listeners.add(listener);
        this.listeners.set(name, listeners);
    }

    removeEventListener(name: string, listener: (event: Event) => void): void {
        this.listeners.get(name)?.delete(listener);
    }

    dispatchEvent(event: Event): boolean {
        for (const listener of this.listeners.get(event.type) ?? []) listener(event);
        return true;
    }

    attachShadow(): FakeShadowRoot {
        this.shadowRoot = new FakeShadowRoot();
        return this.shadowRoot;
    }

    appendChild(child: FakeHTMLElement): FakeHTMLElement {
        if (child.parentElement && child.parentElement !== this) {
            child.isConnected = false;
            (child as unknown as { disconnectedCallback?: () => void }).disconnectedCallback?.();
        }
        child.parentElement = this;
        child.isConnected = true;
        (child as unknown as { connectedCallback?: () => void }).connectedCallback?.();
        return child;
    }

    getBoundingClientRect(): DOMRect {
        return { width: this.layoutWidth } as DOMRect;
    }

    remove(): void {
        if (this.isConnected) {
            this.isConnected = false;
            (this as unknown as { disconnectedCallback?: () => void }).disconnectedCallback?.();
        }
        this.parentElement = null;
    }

    private notifyAttributeChange(
        name: string,
        oldValue: string | null,
        newValue: string | null,
    ): void {
        const callback = (
            this as unknown as {
                attributeChangedCallback?: (
                    name: string,
                    oldValue: string | null,
                    newValue: string | null,
                ) => void;
            }
        ).attributeChangedCallback;
        callback?.call(this, name, oldValue, newValue);
    }
}

function installElementGlobals(): void {
    Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        value: FakeHTMLElement,
    });
    Object.defineProperty(globalThis, "CustomEvent", {
        configurable: true,
        value: class<T> {
            readonly bubbles: boolean;
            readonly composed: boolean;
            readonly detail: T;
            readonly type: string;

            constructor(type: string, init: CustomEventInit<T> = {}) {
                this.type = type;
                this.detail = init.detail as T;
                this.bubbles = init.bubbles ?? false;
                this.composed = init.composed ?? false;
            }
        },
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { origin: "https://app.example" },
    });
}

function restoreElementGlobals(): void {
    for (const [key, descriptor] of Object.entries(ORIGINALS)) {
        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    }
}

export function makeElement(): unknown {
    installElementGlobals();
    return new ElementConstructor() as WpNovaChatElement;
}

export function resolvedConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
    return {
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        iframeOrigin: "https://chat.wp-nova.ai",
        iframeSrc: "https://chat.wp-nova.ai/embed/chat?surface=surf_1",
        presentationMode: "popover",
        sidebarWidth: 384,
        sidebarResizable: false,
        title: "Assistant",
        accent: "#111111",
        triggerColor: "#111111",
        triggerIconColor: "light",
        launcherEnabled: true,
        theme: "light",
        hasFirstPaintLauncherColor: true,
        safeValueSelectors: [],
        voiceModeEnabled: false,
        uiDesign: "classic",
        siteRoutes: [],
        pageWorkflows: [],
        settle: { quietMs: 200, maxWaitMs: 1600 },
        protocolVersion: 1,
        ...overrides,
    };
}

let ElementConstructor: typeof WpNovaChatElement;

export async function setupElementTests(): Promise<void> {
    installElementGlobals();
    ({ WpNovaChatElement: ElementConstructor } = await import("./index.js"));
}

export function teardownElementTests(): void {
    restoreElementGlobals();
}

export function resetElementTestGlobals(): void {
    restoreElementGlobals();
    installElementGlobals();
    __resetTokenCooldownForTests();
}
