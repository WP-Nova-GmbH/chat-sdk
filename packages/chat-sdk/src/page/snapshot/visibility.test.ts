import assert from "node:assert/strict";
import test from "node:test";
import { captureVisiblePageSnapshot, HANDLE_ATTR } from "./index.js";
import { FakeDocument, FakeElement, restoreGlobals } from "./test-support.js";

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
