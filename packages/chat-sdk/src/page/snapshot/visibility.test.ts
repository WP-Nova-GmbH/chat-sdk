import assert from "node:assert/strict";
import test from "node:test";
import { VISIBLE_TEXT_CAP } from "./constants.js";
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

test("off-viewport links and text remain part of rendered page context", () => {
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

        assert.equal(snapshot.links?.[0]?.label, "Offscreen customer");
        assert.equal(snapshot.visibleText, "Offscreen customer");
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

test("rendered descendants survive display-contents and zero-box wrappers", () => {
    const document = new FakeDocument();
    const displayContents = new FakeElement(
        "section",
        new Map([["data-layout", "contents"]]),
        "",
        document,
    );
    displayContents.rect = { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 };
    const zeroBox = new FakeElement("div", new Map([["data-layout", "zero-box"]]), "", document);
    zeroBox.rect = { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 };
    const paragraph = new FakeElement("p", new Map(), "Nested rendered transcript", document);
    zeroBox.append(paragraph);
    displayContents.append(zeroBox);
    document.body.append(displayContents);

    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { innerHeight: 800, innerWidth: 1200, getSelection: () => "" },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: (el: FakeElement) => ({
            display: el.getAttribute("data-layout") === "contents" ? "contents" : "block",
            opacity: "1",
            visibility: "visible",
        }),
    });

    try {
        const snapshot = captureVisiblePageSnapshot();

        assert.equal(snapshot.visibleText, "Nested rendered transcript");
    } finally {
        restoreGlobals();
    }
});

test("truly hidden wrappers prune otherwise visible descendants", () => {
    const document = new FakeDocument();
    const hidden = new FakeElement("section", new Map([["data-layout", "hidden"]]), "", document);
    hidden.append(new FakeElement("p", new Map(), "Must not leak", document));
    document.body.append(hidden);

    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { innerHeight: 800, innerWidth: 1200, getSelection: () => "" },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: (el: FakeElement) => ({
            display: el.getAttribute("data-layout") === "hidden" ? "none" : "block",
            opacity: "1",
            visibility: "visible",
        }),
    });

    try {
        const snapshot = captureVisiblePageSnapshot();

        assert.equal(snapshot.visibleText, undefined);
    } finally {
        restoreGlobals();
    }
});

test("rendered text preserves truncation metadata at the 200,000 character ceiling", () => {
    const document = new FakeDocument();
    document.body.append(
        new FakeElement("p", new Map(), "x".repeat(VISIBLE_TEXT_CAP + 50), document),
    );

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

        assert.equal(snapshot.visibleText?.length, VISIBLE_TEXT_CAP);
        assert.equal(snapshot.truncated, true);
    } finally {
        restoreGlobals();
    }
});

test("rendered text counts join separators in the truncation budget", () => {
    const document = new FakeDocument();
    for (let index = 0; index < VISIBLE_TEXT_CAP / 2 + 1; index += 1) {
        document.body.append(new FakeElement("span", new Map(), "x", document));
    }

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

        assert.equal(snapshot.visibleText?.length, VISIBLE_TEXT_CAP - 1);
        assert.equal(snapshot.truncated, true);
    } finally {
        restoreGlobals();
    }
});
