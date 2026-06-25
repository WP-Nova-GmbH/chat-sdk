import assert from "node:assert/strict";
import test from "node:test";
import { executeNavigation } from "./navigation.js";

const ORIGINALS = {
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
    history: Object.getOwnPropertyDescriptor(globalThis, "history"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    requestAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame"),
    PopStateEvent: Object.getOwnPropertyDescriptor(globalThis, "PopStateEvent"),
    CustomEvent: Object.getOwnPropertyDescriptor(globalThis, "CustomEvent"),
};

function restoreGlobal(name: keyof typeof ORIGINALS): void {
    const descriptor = ORIGINALS[name];
    if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
    } else {
        Reflect.deleteProperty(globalThis, name);
    }
}

function restoreBrowserGlobals(): void {
    for (const key of Object.keys(ORIGINALS) as (keyof typeof ORIGINALS)[]) {
        restoreGlobal(key);
    }
}

test("URL navigation stays in-document and returns a tool result", async () => {
    const events: string[] = [];
    let assignedUrl: string | undefined;
    let pushedUrl: string | undefined;
    const locationStub = {
        href: "https://app.example/orders",
        pathname: "/orders",
        origin: "https://app.example",
        assign(url: string) {
            assignedUrl = url;
        },
    };

    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: locationStub,
    });
    Object.defineProperty(globalThis, "history", {
        configurable: true,
        value: {
            state: null,
            pushState(_state: unknown, _title: string, url: string) {
                pushedUrl = url;
                locationStub.href = url;
                locationStub.pathname = new URL(url).pathname;
            },
        },
    });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            dispatchEvent(event: Event) {
                events.push(event.type);
                return true;
            },
            getSelection: () => "",
        },
    });
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
            title: "Orders",
            body: { children: [] },
            children: [],
            documentElement: { clientHeight: 800, clientWidth: 1200 },
            querySelector: () => null,
            querySelectorAll: () => [],
        },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        },
    });
    Object.defineProperty(globalThis, "PopStateEvent", {
        configurable: true,
        value: class extends Event {
            constructor(type: string, _init?: PopStateEventInit) {
                super(type);
            }
        },
    });
    Object.defineProperty(globalThis, "CustomEvent", {
        configurable: true,
        value: class extends Event {
            detail: unknown;
            constructor(type: string, init?: CustomEventInit) {
                super(type);
                this.detail = init?.detail;
            }
        },
    });

    try {
        const result = await executeNavigation(
            { name: "navigate", args: { url: "/orders/9" } },
            [],
        );

        assert.equal(assignedUrl, undefined);
        assert.equal(pushedUrl, "https://app.example/orders/9");
        assert.deepEqual(events, ["popstate", "wp-nova:navigate"]);
        assert.deepEqual(result.result, {
            ok: true,
            navigatedTo: "https://app.example/orders/9",
        });
        assert.equal(result.snapshot?.url, "https://app.example/orders/9");
    } finally {
        restoreBrowserGlobals();
    }
});

test("open_record can use a durable same-origin URL", async () => {
    const events: string[] = [];
    let pushedUrl: string | undefined;
    const locationStub = {
        href: "https://app.example/customers",
        pathname: "/customers",
        origin: "https://app.example",
    };

    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: locationStub,
    });
    Object.defineProperty(globalThis, "history", {
        configurable: true,
        value: {
            state: null,
            pushState(_state: unknown, _title: string, url: string) {
                pushedUrl = url;
                locationStub.href = url;
                locationStub.pathname = new URL(url).pathname;
            },
        },
    });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            dispatchEvent(event: Event) {
                events.push(event.type);
                return true;
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
            querySelectorAll: () => [],
        },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        },
    });
    Object.defineProperty(globalThis, "PopStateEvent", {
        configurable: true,
        value: class extends Event {
            constructor(type: string, _init?: PopStateEventInit) {
                super(type);
            }
        },
    });
    Object.defineProperty(globalThis, "CustomEvent", {
        configurable: true,
        value: class extends Event {
            detail: unknown;
            constructor(type: string, init?: CustomEventInit) {
                super(type);
                this.detail = init?.detail;
            }
        },
    });

    try {
        const result = await executeNavigation({
            name: "open_record",
            args: { url: "/customers/cus-001" },
        });

        assert.equal(pushedUrl, "https://app.example/customers/cus-001");
        assert.deepEqual(events, ["popstate", "wp-nova:navigate"]);
        assert.deepEqual(result.result, {
            ok: true,
            navigatedTo: "https://app.example/customers/cus-001",
            openedUrl: "https://app.example/customers/cus-001",
        });
    } finally {
        restoreBrowserGlobals();
    }
});

test("stale handle fallback resolves an anchor by implicit link role and exact name", async () => {
    const events: string[] = [];
    let pushedUrl: string | undefined;
    const locationStub = {
        href: "https://app.example/customers",
        pathname: "/customers",
        origin: "https://app.example",
    };
    const anchor = {
        tagName: "A",
        href: "https://app.example/customers/cus-001",
        textContent: "Acme Renewables",
        style: { outline: "" },
        getAttribute(name: string) {
            if (name === "href") return "/customers/cus-001";
            if (name === "aria-label") return null;
            if (name === "role") return null;
            return null;
        },
        scrollIntoView() {
            return undefined;
        },
        click() {
            return undefined;
        },
    };

    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: locationStub,
    });
    Object.defineProperty(globalThis, "history", {
        configurable: true,
        value: {
            state: null,
            pushState(_state: unknown, _title: string, url: string) {
                pushedUrl = url;
                locationStub.href = url;
                locationStub.pathname = new URL(url).pathname;
            },
        },
    });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            dispatchEvent(event: Event) {
                events.push(event.type);
                return true;
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
            querySelectorAll: () => [anchor],
        },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        },
    });
    Object.defineProperty(globalThis, "PopStateEvent", {
        configurable: true,
        value: class extends Event {
            constructor(type: string, _init?: PopStateEventInit) {
                super(type);
            }
        },
    });
    Object.defineProperty(globalThis, "CustomEvent", {
        configurable: true,
        value: class extends Event {
            detail: unknown;
            constructor(type: string, init?: CustomEventInit) {
                super(type);
                this.detail = init?.detail;
            }
        },
    });

    try {
        const result = await executeNavigation({
            name: "open_record",
            args: {
                handle: "stale-handle",
                fingerprint: { role: "link", name: "Acme Renewables" },
            },
        });

        assert.equal(pushedUrl, "https://app.example/customers/cus-001");
        assert.deepEqual(events, ["popstate", "wp-nova:navigate"]);
        assert.deepEqual(result.result, {
            ok: true,
            navigatedTo: "https://app.example/customers/cus-001",
            opened: "stale-handle",
        });
        assert.equal(result.snapshot?.url, "https://app.example/customers/cus-001");
    } finally {
        restoreBrowserGlobals();
    }
});
