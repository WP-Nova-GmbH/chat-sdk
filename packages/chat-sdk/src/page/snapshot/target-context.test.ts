import assert from "node:assert/strict";
import test from "node:test";
import { captureVisiblePageSnapshot } from "./index.js";
import { FakeDocument, FakeElement, restoreGlobals } from "./test-support.js";

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
