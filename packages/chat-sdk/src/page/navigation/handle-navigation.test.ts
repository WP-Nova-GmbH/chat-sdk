import assert from "node:assert/strict";
import test from "node:test";
import { executeNavigation } from "./index.js";
import { restoreBrowserGlobals } from "./test-support.js";

test("click executes a captured UI control natively", async () => {
    let clicked = 0;
    const button = {
        tagName: "BUTTON",
        textContent: "Select",
        style: { outline: "" },
        getAttribute(name: string) {
            if (name === "aria-label") return null;
            if (name === "role") return null;
            return null;
        },
        scrollIntoView() {
            return undefined;
        },
        click() {
            clicked += 1;
        },
    };

    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: {
            href: "https://app.example/customers",
            pathname: "/customers",
            origin: "https://app.example",
        },
    });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            dispatchEvent() {
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
            querySelectorAll: (selector: string) =>
                selector === "a, button, input, select, textarea, [role]" ? [button] : [],
        },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        },
    });

    try {
        const result = await executeNavigation({
            name: "click",
            args: { handle: "stale-handle", fingerprint: { role: "button", name: "Select" } },
        });

        assert.equal(clicked, 1);
        assert.deepEqual(result.result, { ok: true, clicked: "stale-handle" });
        assert.equal(result.snapshot?.url, "https://app.example/customers");
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
        assign(url: string) {
            pushedUrl = url;
            locationStub.href = url;
            locationStub.pathname = new URL(url).pathname;
        },
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
            querySelectorAll: (selector: string) =>
                selector === "a, button, input, select, textarea, [role]" ? [anchor] : [],
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
        assert.deepEqual(events, ["wp-nova:navigate"]);
        assert.deepEqual(result.result, {
            ok: true,
            navigatedTo: "https://app.example/customers/cus-001",
            opened: "stale-handle",
            navigation: "document",
        });
        assert.equal(result.snapshot?.url, "https://app.example/customers/cus-001");
    } finally {
        restoreBrowserGlobals();
    }
});
