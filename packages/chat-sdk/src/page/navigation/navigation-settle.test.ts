import assert from "node:assert/strict";
import test from "node:test";
import { executeNavigation } from "./index.js";
import { restoreBrowserGlobals } from "./test-support.js";

test("a cap-hit settle flags the post-action snapshot as unsettled", async () => {
    // A never-firing observer plus a zero cap: the cap timer is armed before the
    // quiet timer, so the settle resolves unsettled and the capture is flagged.
    const observerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
    Object.defineProperty(globalThis, "MutationObserver", {
        configurable: true,
        value: class {
            observe(): void {}
            disconnect(): void {}
        },
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href: "https://app.example/orders", pathname: "/orders" },
    });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            getSelection: () => "",
            addEventListener() {},
            removeEventListener() {},
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

    try {
        const result = await executeNavigation({ name: "refresh_context", args: {} }, [], undefined, {
            quietMs: 0,
            maxWaitMs: 0,
        });

        assert.deepEqual(result.result, {
            ok: true,
            refreshed: true,
            url: "https://app.example/orders",
        });
        assert.equal(result.snapshot?.snapshot?.unsettled, true);
    } finally {
        restoreBrowserGlobals();
        if (observerDescriptor) {
            Object.defineProperty(globalThis, "MutationObserver", observerDescriptor);
        } else {
            Reflect.deleteProperty(globalThis, "MutationObserver");
        }
    }
});
