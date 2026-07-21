import assert from "node:assert/strict";
import test from "node:test";
import { ORIGINALS } from "./test-support.js";
import { TokenTimers } from "./token-timers.js";

test("armRefresh schedules no proactive refresh for a missing or zero TTL", () => {
    const scheduled: number[] = [];
    const timers = new TokenTimers();
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: (_callback: () => void, ms?: number) => {
            scheduled.push(Number(ms ?? 0));
            return 1;
        },
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });

    try {
        timers.armRefresh(0, () => undefined);
        timers.armRefresh(Number.NaN, () => undefined);
        assert.deepEqual(scheduled, []);

        // A normal TTL still arms a proactive re-mint at ~80% of the lifetime.
        timers.armRefresh(900, () => undefined);
        assert.deepEqual(scheduled, [720_000]);
    } finally {
        if (ORIGINALS.setTimeout) Object.defineProperty(globalThis, "setTimeout", ORIGINALS.setTimeout);
        if (ORIGINALS.clearTimeout)
            Object.defineProperty(globalThis, "clearTimeout", ORIGINALS.clearTimeout);
    }
});
