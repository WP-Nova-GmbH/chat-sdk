import assert from "node:assert/strict";
import test from "node:test";
import { capturePageContext, captureVisiblePageSnapshot, HANDLE_ATTR } from "./snapshot.js";

const ORIGINALS = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    getComputedStyle: Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
};

interface RectLike {
    bottom: number;
    height: number;
    left: number;
    right: number;
    top: number;
    width: number;
}

class FakeElement {
    readonly children: FakeElement[] = [];
    readonly ownerDocument: FakeDocument;
    parentElement: FakeElement | null = null;

    constructor(
        readonly tagName: string,
        private readonly attrs: Map<string, string>,
        readonly textContent: string,
        ownerDocument: FakeDocument,
    ) {
        this.ownerDocument = ownerDocument;
    }

    append(child: FakeElement): void {
        child.parentElement = this;
        this.children.push(child);
    }

    getAttribute(name: string): string | null {
        return this.attrs.get(name) ?? null;
    }

    setAttribute(name: string, value: string): void {
        this.attrs.set(name, value);
    }

    hasAttribute(name: string): boolean {
        return this.attrs.has(name);
    }

    getClientRects(): RectLike[] {
        return [this.getBoundingClientRect()];
    }

    getBoundingClientRect(): RectLike {
        return { bottom: 20, height: 20, left: 0, right: 200, top: 0, width: 200 };
    }

    closest(selector: string): FakeElement | null {
        const attr = selector.match(/^\[([^\]]+)\]$/)?.[1];
        if (!attr) return null;
        let node: FakeElement | null = this;
        while (node) {
            if (node.hasAttribute(attr)) return node;
            node = node.parentElement;
        }
        return null;
    }

    matches(): boolean {
        return false;
    }
}

class FakeDocument {
    readonly documentElement = { clientHeight: 800, clientWidth: 1200 };
    readonly title = "Customers";
    readonly body = new FakeElement("body", new Map(), "", this);
    readonly children = [this.body];

    querySelector(): FakeElement | null {
        return null;
    }

    querySelectorAll(): FakeElement[] {
        return [];
    }

    getElementById(): FakeElement | null {
        return null;
    }
}

function restoreGlobals(): void {
    for (const [key, descriptor] of Object.entries(ORIGINALS)) {
        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    }
}

test("captures keep a live element's handle stable across background recaptures", () => {
    const document = new FakeDocument();
    const link = new FakeElement(
        "a",
        new Map([["href", "https://app.example/customers/cus-001"]]),
        "Acme Renewables",
        document,
    );
    document.body.append(link);

    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            getSelection: () => "",
        },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: () => ({ display: "block", opacity: "1", visibility: "visible" }),
    });

    try {
        const first = captureVisiblePageSnapshot();
        const firstHandle = first.links?.[0]?.handle;
        assert.ok(firstHandle);
        assert.equal(link.getAttribute(HANDLE_ATTR), firstHandle);

        const second = captureVisiblePageSnapshot();

        assert.equal(second.links?.[0]?.handle, firstHandle);
        assert.equal(link.getAttribute(HANDLE_ATTR), firstHandle);
    } finally {
        restoreGlobals();
    }
});

test("page context omits raw mainHtml so ignored markup cannot bypass field policy", () => {
    const document = new FakeDocument();
    const main = new FakeElement(
        "main",
        new Map(),
        "Visible customer Password: swordfish",
        document,
    );
    const ignored = new FakeElement(
        "input",
        new Map([
            ["type", "hidden"],
            ["value", "secret"],
            ["data-wp-nova-ignore", ""],
        ]),
        "",
        document,
    );
    main.append(ignored);
    document.body.append(main);

    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            getSelection: () => "",
        },
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href: "https://app.example/customers", pathname: "/customers" },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: () => ({ display: "block", opacity: "1", visibility: "visible" }),
    });

    try {
        const context = capturePageContext();

        assert.equal("mainHtml" in context, false);
        assert.notEqual(context.snapshot?.visibleText?.includes("swordfish"), true);
    } finally {
        restoreGlobals();
    }
});
