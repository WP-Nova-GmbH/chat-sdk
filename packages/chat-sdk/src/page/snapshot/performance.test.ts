import assert from "node:assert/strict";
import test from "node:test";
import { captureVisiblePageSnapshot } from "./index.js";
import { FakeDocument, FakeElement, restoreGlobals } from "./test-support.js";

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
