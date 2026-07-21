import assert from "node:assert/strict";
import test from "node:test";
import { BlockedNavigationError, executeNavigation } from "./index.js";
import {
    crossOriginAnchor,
    installNavGlobals,
    restoreBrowserGlobals,
} from "./test-support.js";

for (const verb of ["click", "navigate", "open_record"] as const) {
    test(`${verb} blocks a cross-origin anchor handle instead of navigating`, async () => {
        const clickedRef = { count: 0 };
        installNavGlobals(crossOriginAnchor(clickedRef));
        try {
            await assert.rejects(
                executeNavigation({
                    name: verb,
                    args: {
                        handle: "stale-handle",
                        fingerprint: { role: "link", name: "External link" },
                    },
                }),
                BlockedNavigationError,
            );
            assert.equal(clickedRef.count, 0);
        } finally {
            restoreBrowserGlobals();
        }
    });
}

test("an aborted signal stops a navigation action before it clicks", async () => {
    const clickedRef = { count: 0 };
    installNavGlobals({
        tagName: "BUTTON",
        textContent: "Select",
        style: { outline: "" },
        getAttribute: () => null,
        scrollIntoView: () => undefined,
        click() {
            clickedRef.count += 1;
        },
    });
    const controller = new AbortController();
    controller.abort();
    try {
        await assert.rejects(
            executeNavigation(
                {
                    name: "click",
                    args: { handle: "stale-handle", fingerprint: { role: "button", name: "Select" } },
                },
                [],
                controller.signal,
            ),
        );
        assert.equal(clickedRef.count, 0);
    } finally {
        restoreBrowserGlobals();
    }
});
