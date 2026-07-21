import { __resetTokenCooldownForTests } from "../../auth/token.js";
import type { ResolvedConfig } from "../../config/config.js";
import type { WpNovaChatElement } from "./index.js";

export const ORIGINALS = {
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
    fetch: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
    setTimeout: Object.getOwnPropertyDescriptor(globalThis, "setTimeout"),
    clearTimeout: Object.getOwnPropertyDescriptor(globalThis, "clearTimeout"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
};

class FakeElement {
    hidden = false;
    src = "";
    private readonly attributes = new Map<string, string>();
    private readonly listeners = new Map<string, Array<() => void>>();

    setAttribute(name: string, value = ""): void {
        this.attributes.set(name, value);
    }

    getAttribute(name: string): string | undefined {
        return this.attributes.get(name);
    }

    addEventListener(name: string, listener: () => void): void {
        const existing = this.listeners.get(name) ?? [];
        existing.push(listener);
        this.listeners.set(name, existing);
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
    shadowRoot?: FakeShadowRoot;
    private readonly attributes = new Set<string>();
    readonly style = {
        setProperty: (_name: string, _value: string) => undefined,
        removeProperty: (_name: string) => undefined,
    };

    setAttribute(name: string): void {
        this.attributes.add(name);
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    attachShadow(): FakeShadowRoot {
        this.shadowRoot = new FakeShadowRoot();
        return this.shadowRoot;
    }
}

function installElementGlobals(): void {
    Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        value: FakeHTMLElement,
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
        title: "Assistant",
        accent: "#111111",
        triggerColor: "#111111",
        triggerIconColor: "light",
        hasFirstPaintLauncherColor: true,
        safeValueSelectors: [],
        voiceModeEnabled: false,
        siteRoutes: [],
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
