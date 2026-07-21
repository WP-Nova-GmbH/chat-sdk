const ORIGINALS = {
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
    history: Object.getOwnPropertyDescriptor(globalThis, "history"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    requestAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame"),
    PopStateEvent: Object.getOwnPropertyDescriptor(globalThis, "PopStateEvent"),
    CustomEvent: Object.getOwnPropertyDescriptor(globalThis, "CustomEvent"),
    setTimeout: Object.getOwnPropertyDescriptor(globalThis, "setTimeout"),
    clearTimeout: Object.getOwnPropertyDescriptor(globalThis, "clearTimeout"),
};

function restoreGlobal(name: keyof typeof ORIGINALS): void {
    const descriptor = ORIGINALS[name];
    if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
    } else {
        Reflect.deleteProperty(globalThis, name);
    }
}

export function restoreBrowserGlobals(): void {
    for (const key of Object.keys(ORIGINALS) as (keyof typeof ORIGINALS)[]) {
        restoreGlobal(key);
    }
}

/** Build minimal browser globals exposing one element via the fingerprint query. */
export function installNavGlobals(target: Record<string, unknown>): void {
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: {
            href: "https://app.example/customers",
            pathname: "/customers",
            origin: "https://app.example",
            assign() {
                throw new Error("location.assign must not be called for a blocked navigation");
            },
        },
    });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            dispatchEvent() {
                throw new Error("dispatchEvent must not be called for a blocked navigation");
            },
            getSelection: () => "",
        },
    });
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
            title: "Customers",
            body: { children: [] },
            children: [],
            documentElement: { clientHeight: 800, clientWidth: 1200 },
            querySelector: () => null,
            querySelectorAll: (selector: string) =>
                selector === "a, button, input, select, textarea, [role]" ? [target] : [],
        },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        },
    });
    // Stub the scroll-highlight reset timer so it cannot linger after the test.
    Object.defineProperty(globalThis, "setTimeout", { configurable: true, value: () => 1 });
    Object.defineProperty(globalThis, "clearTimeout", { configurable: true, value: () => undefined });
}

export function crossOriginAnchor(clickedRef: { count: number }): Record<string, unknown> {
    return {
        tagName: "A",
        href: "https://evil.example/phishing",
        textContent: "External link",
        style: { outline: "" },
        getAttribute(name: string) {
            if (name === "href") return "https://evil.example/phishing";
            return null;
        },
        scrollIntoView() {
            return undefined;
        },
        click() {
            clickedRef.count += 1;
        },
    };
}
