import assert from "node:assert/strict";
import test from "node:test";
import {
    capturePageContext,
    captureVisiblePageSnapshot,
    clearHandleStamps,
    HANDLE_ATTR,
    resolveHandleNode,
} from "./snapshot.js";

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
    readonly childNodes: Array<FakeElement | { nodeType: number; textContent: string }> = [];
    readonly ownerDocument: FakeDocument;
    parentElement: FakeElement | null = null;
    rect: RectLike = { bottom: 20, height: 20, left: 0, right: 200, top: 0, width: 200 };
    value?: string;

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
        this.childNodes.push(child);
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

    removeAttribute(name: string): void {
        this.attrs.delete(name);
    }

    getClientRects(): RectLike[] {
        return [this.getBoundingClientRect()];
    }

    getBoundingClientRect(): RectLike {
        return this.rect;
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
    allNodes: FakeElement[] = [];

    querySelector(): FakeElement | null {
        return null;
    }

    querySelectorAll(selector?: string): FakeElement[] {
        if (selector === "[data-ai-context]") {
            return this.allNodes.filter((node) => node.hasAttribute("data-ai-context"));
        }
        if (selector === `[${HANDLE_ATTR}]`) {
            const found: FakeElement[] = [];
            const walk = (el: FakeElement): void => {
                if (el.hasAttribute(HANDLE_ATTR)) found.push(el);
                for (const child of el.children) walk(child);
            };
            walk(this.body);
            return found;
        }
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

test("off-viewport links and text are skipped", () => {
    const document = new FakeDocument();
    const link = new FakeElement(
        "a",
        new Map([["href", "https://app.example/customers/cus-001"]]),
        "Offscreen customer",
        document,
    );
    link.rect = { bottom: 1020, height: 20, left: 0, right: 200, top: 1000, width: 200 };
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
        const snapshot = captureVisiblePageSnapshot();

        assert.equal(snapshot.links, undefined);
        assert.equal(snapshot.visibleText, undefined);
    } finally {
        restoreGlobals();
    }
});

test("mixed inline text is captured once", () => {
    const document = new FakeDocument();
    const paragraph = new FakeElement("p", new Map(), "Hello world", document);
    const strong = new FakeElement("strong", new Map(), "world", document);
    paragraph.childNodes.push({ nodeType: 3, textContent: "Hello " });
    paragraph.append(strong);
    strong.childNodes.push({ nodeType: 3, textContent: "world" });
    document.body.append(paragraph);

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
        const snapshot = captureVisiblePageSnapshot();

        assert.equal(snapshot.visibleText, "Hello world");
    } finally {
        restoreGlobals();
    }
});

test("data-ai-context respects ignore, viewport, sensitivity, and caps", () => {
    const document = new FakeDocument();
    const included = new FakeElement(
        "div",
        new Map([["data-ai-context", "summary"]]),
        "Visible summary",
        document,
    );
    const ignored = new FakeElement(
        "div",
        new Map([
            ["data-ai-context", "ignored"],
            ["data-wp-nova-ignore", ""],
        ]),
        "Should not leak",
        document,
    );
    const offscreen = new FakeElement(
        "div",
        new Map([["data-ai-context", "offscreen"]]),
        "Offscreen context",
        document,
    );
    const sensitive = new FakeElement(
        "div",
        new Map([["data-ai-context", "secret_token"]]),
        "Sensitive context",
        document,
    );
    const long = new FakeElement(
        "div",
        new Map([["data-ai-context", "long"]]),
        "x".repeat(700),
        document,
    );
    offscreen.rect = { bottom: 1020, height: 20, left: 0, right: 200, top: 1000, width: 200 };
    document.allNodes = [included, ignored, offscreen, sensitive, long];
    document.body.append(included);
    document.body.append(ignored);
    document.body.append(offscreen);
    document.body.append(sensitive);
    document.body.append(long);

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

        assert.equal(context.aiFields?.summary, "Visible summary");
        assert.equal(context.aiFields?.ignored, undefined);
        assert.equal(context.aiFields?.offscreen, undefined);
        assert.equal(context.aiFields?.secret_token, undefined);
        assert.equal(context.aiFields?.long?.length, 500);
    } finally {
        restoreGlobals();
    }
});

test("field values omitted by policy are reported without leaking the value", () => {
    const document = new FakeDocument();
    const customerName = new FakeElement(
        "input",
        new Map([
            ["type", "text"],
            ["aria-label", "Customer name"],
        ]),
        "",
        document,
    );
    customerName.value = "Ada Lovelace";
    const password = new FakeElement(
        "input",
        new Map([
            ["type", "password"],
            ["aria-label", "Portal password"],
        ]),
        "",
        document,
    );
    password.value = "swordfish";
    const city = new FakeElement(
        "input",
        new Map([
            ["type", "text"],
            ["aria-label", "City"],
            ["data-wp-nova-include", ""],
        ]),
        "",
        document,
    );
    city.value = "Berlin";
    document.body.append(customerName);
    document.body.append(password);
    document.body.append(city);

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
        const snapshot = captureVisiblePageSnapshot();
        const serialized = JSON.stringify(snapshot);

        assert.equal(serialized.includes("Ada Lovelace"), false);
        assert.equal(serialized.includes("swordfish"), false);
        assert.equal(serialized.includes("Berlin"), true);
        assert.deepEqual(
            snapshot.omittedValues?.map(({ label, reason }) => ({ label, reason })),
            [
                { label: "Customer name", reason: "not_opted_in" },
                { label: "Portal password", reason: "sensitive" },
            ],
        );
    } finally {
        restoreGlobals();
    }
});

test("controls include nearby row context without repeating the clicked label", () => {
    const document = new FakeDocument();
    const row = new FakeElement("tr", new Map(), "", document);
    const idCell = new FakeElement("td", new Map(), "HF-219", document);
    const actionCell = new FakeElement("td", new Map(), "", document);
    const button = new FakeElement("button", new Map(), "Select", document);
    actionCell.append(button);
    row.append(idCell);
    row.append(actionCell);
    document.body.append(row);

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
        const snapshot = captureVisiblePageSnapshot();

        assert.equal(snapshot.controls?.[0]?.label, "Select");
        assert.equal(snapshot.controls?.[0]?.context, "HF-219");
        assert.equal(snapshot.controls?.[0]?.context?.includes("Select"), false);
    } finally {
        restoreGlobals();
    }
});

test("list/card-like control context is capped", () => {
    const document = new FakeDocument();
    const item = new FakeElement(
        "li",
        new Map(),
        `Record ${"x".repeat(220)}`,
        document,
    );
    const button = new FakeElement("button", new Map(), "Select", document);
    item.childNodes.push({ nodeType: 3, textContent: `Record ${"x".repeat(220)}` });
    item.append(button);
    document.body.append(item);

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
        const snapshot = captureVisiblePageSnapshot();

        assert.equal(snapshot.controls?.[0]?.context?.startsWith("Record "), true);
        assert.equal(snapshot.controls?.[0]?.context?.length, 160);
    } finally {
        restoreGlobals();
    }
});

test("target context does not include field-like text withheld by policy", () => {
    const document = new FakeDocument();
    const row = new FakeElement("tr", new Map(), "", document);
    const idCell = new FakeElement("td", new Map(), "HF-219", document);
    const notes = new FakeElement(
        "div",
        new Map([
            ["contenteditable", ""],
            ["aria-label", "Internal notes"],
        ]),
        "do not leak this note",
        document,
    );
    const button = new FakeElement("button", new Map(), "Select", document);
    row.append(idCell);
    row.append(notes);
    row.append(button);
    document.body.append(row);

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
        const snapshot = captureVisiblePageSnapshot();
        const selectControl = snapshot.controls?.find((control) => control.label === "Select");

        assert.equal(selectControl?.context, "HF-219");
        assert.equal(JSON.stringify(snapshot).includes("do not leak this note"), false);
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

test("clearHandleStamps removes every data-wp-nova-h from the host DOM", () => {
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
        value: { innerHeight: 800, innerWidth: 1200, getSelection: () => "" },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: () => ({ display: "block", opacity: "1", visibility: "visible" }),
    });

    try {
        const snapshot = captureVisiblePageSnapshot();
        const handle = snapshot.links?.[0]?.handle;
        assert.ok(handle);
        assert.equal(link.getAttribute(HANDLE_ATTR), handle);
        assert.equal(document.querySelectorAll(`[${HANDLE_ATTR}]`).length, 1);

        clearHandleStamps();

        assert.equal(link.getAttribute(HANDLE_ATTR), null);
        assert.equal(document.querySelectorAll(`[${HANDLE_ATTR}]`).length, 0);
        assert.equal(resolveHandleNode(handle), undefined);
    } finally {
        restoreGlobals();
    }
});

test("capture walks each element once (isVisible/getComputedStyle ~once per element)", () => {
    const document = new FakeDocument();
    // A pure-text subtree: no links/controls, so no targetContext walk confounds
    // the count. The single fused walk calls isVisible once per element.
    const article = new FakeElement("article", new Map(), "", document);
    const p1 = new FakeElement("p", new Map(), "First paragraph", document);
    const p2 = new FakeElement("p", new Map(), "Second paragraph", document);
    article.append(p1);
    article.append(p2);
    document.body.append(article);

    let computedStyleCalls = 0;
    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { innerHeight: 800, innerWidth: 1200, getSelection: () => "" },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: () => {
            computedStyleCalls++;
            return { display: "block", opacity: "1", visibility: "visible" };
        },
    });

    try {
        captureVisiblePageSnapshot();

        // 3 elements (article, p1, p2) → exactly 3 isVisible reads. The previous
        // two-walk implementation would have produced 6.
        assert.equal(computedStyleCalls, 3);
    } finally {
        restoreGlobals();
    }
});
