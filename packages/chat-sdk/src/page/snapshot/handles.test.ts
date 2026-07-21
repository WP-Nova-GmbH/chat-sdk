import assert from "node:assert/strict";
import test from "node:test";
import {
    captureVisiblePageSnapshot,
    clearHandleStamps,
    HANDLE_ATTR,
    resolveHandleNode,
} from "./index.js";
import { FakeDocument, FakeElement, restoreGlobals } from "./test-support.js";

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
