import assert from "node:assert/strict";
import test from "node:test";
import { captureSettledPageContext, DEFAULT_SETTLE, SETTLED_EVENT, settleDom } from "./settle.js";

const ORIGINALS = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
    MutationObserver: Object.getOwnPropertyDescriptor(globalThis, "MutationObserver"),
    requestAnimationFrame: Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame"),
    setTimeout: Object.getOwnPropertyDescriptor(globalThis, "setTimeout"),
    clearTimeout: Object.getOwnPropertyDescriptor(globalThis, "clearTimeout"),
};

function restoreGlobals(): void {
    for (const [key, descriptor] of Object.entries(ORIGINALS)) {
        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    }
}

/** Deterministic manual clock backing the stubbed setTimeout/clearTimeout. */
class FakeClock {
    now = 0;
    timers = new Map<number, { at: number; fn: () => void }>();
    private nextId = 1;

    setTimeout = (fn: () => void, delay: number): number => {
        const id = this.nextId++;
        this.timers.set(id, { at: this.now + delay, fn });
        return id;
    };

    clearTimeout = (id: number): void => {
        this.timers.delete(id);
    };

    /** Advance the clock, firing due timers in time-then-insertion order. */
    advance(ms: number): void {
        const target = this.now + ms;
        for (;;) {
            const due = [...this.timers.entries()]
                .filter(([, timer]) => timer.at <= target)
                .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            if (!due) break;
            this.timers.delete(due[0]);
            this.now = due[1].at;
            due[1].fn();
        }
        this.now = target;
    }
}

class StubMutationObserver {
    static instances: StubMutationObserver[] = [];
    observed: unknown[] = [];
    disconnected = false;

    constructor(private readonly callback: () => void) {
        StubMutationObserver.instances.push(this);
    }

    observe(target: unknown, options: unknown): void {
        this.observed.push({ target, options });
    }

    disconnect(): void {
        this.disconnected = true;
    }

    trigger(): void {
        this.callback();
    }
}

type Listener = (event: unknown) => void;

function installSettleGlobals(clock: FakeClock): { listeners: Map<string, Set<Listener>> } {
    StubMutationObserver.instances = [];
    const listeners = new Map<string, Set<Listener>>();
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            getSelection: () => "",
            addEventListener(type: string, fn: Listener) {
                if (!listeners.has(type)) listeners.set(type, new Set());
                listeners.get(type)?.add(fn);
            },
            removeEventListener(type: string, fn: Listener) {
                listeners.get(type)?.delete(fn);
            },
            dispatchEvent(event: { type: string }) {
                for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event);
                return true;
            },
        },
    });
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
            title: "Host App",
            body: { children: [] },
            children: [],
            documentElement: { clientHeight: 800, clientWidth: 1200 },
            querySelector: () => null,
            querySelectorAll: () => [],
        },
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href: "https://host.example/orders", pathname: "/orders" },
    });
    Object.defineProperty(globalThis, "MutationObserver", {
        configurable: true,
        value: StubMutationObserver,
    });
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: clock.setTimeout,
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: clock.clearTimeout,
    });
    return { listeners };
}

/** Flush pending microtasks so `.then` observers run after a clock advance. */
function flush(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

test("resolves settled after a mutation-free quiet window", async () => {
    const clock = new FakeClock();
    installSettleGlobals(clock);
    try {
        let result: { settled: boolean } | undefined;
        void settleDom({ quietMs: 200, maxWaitMs: 1600 }).then((r) => {
            result = r;
        });
        clock.advance(199);
        await flush();
        assert.equal(result, undefined);
        clock.advance(1);
        await flush();
        assert.deepEqual(result, { settled: true });
        assert.equal(StubMutationObserver.instances[0]?.disconnected, true);
        assert.equal(clock.timers.size, 0);
    } finally {
        restoreGlobals();
    }
});

test("mutations restart the quiet window", async () => {
    const clock = new FakeClock();
    installSettleGlobals(clock);
    try {
        let result: { settled: boolean } | undefined;
        void settleDom({ quietMs: 200, maxWaitMs: 1600 }).then((r) => {
            result = r;
        });
        clock.advance(150);
        StubMutationObserver.instances[0]?.trigger();
        clock.advance(199);
        await flush();
        assert.equal(result, undefined);
        clock.advance(1);
        await flush();
        assert.deepEqual(result, { settled: true });
    } finally {
        restoreGlobals();
    }
});

test("a page that never goes quiet resolves unsettled at the cap", async () => {
    const clock = new FakeClock();
    installSettleGlobals(clock);
    try {
        let result: { settled: boolean } | undefined;
        void settleDom({ quietMs: 200, maxWaitMs: 1000 }).then((r) => {
            result = r;
        });
        for (let elapsed = 0; elapsed < 1000; elapsed += 100) {
            clock.advance(100);
            StubMutationObserver.instances[0]?.trigger();
        }
        await flush();
        assert.deepEqual(result, { settled: false });
        assert.equal(StubMutationObserver.instances[0]?.disconnected, true);
    } finally {
        restoreGlobals();
    }
});

test("the wp-nova:settled host event ends the wait early", async () => {
    const clock = new FakeClock();
    const { listeners } = installSettleGlobals(clock);
    try {
        let result: { settled: boolean } | undefined;
        void settleDom({ quietMs: 200, maxWaitMs: 1600 }).then((r) => {
            result = r;
        });
        clock.advance(50);
        (globalThis as unknown as { window: Window }).window.dispatchEvent({
            type: SETTLED_EVENT,
        } as Event);
        await flush();
        assert.deepEqual(result, { settled: true });
        assert.equal(listeners.get(SETTLED_EVENT)?.size ?? 0, 0);
        assert.equal(clock.timers.size, 0);
    } finally {
        restoreGlobals();
    }
});

test("host-signal mode ignores an early quiet window", async () => {
    const clock = new FakeClock();
    installSettleGlobals(clock);
    try {
        let result: { settled: boolean } | undefined;
        void settleDom(
            { quietMs: 200, maxWaitMs: 1600, waitForNavigationSignal: true },
            undefined,
            true,
        ).then((settled) => {
            result = settled;
        });

        clock.advance(800);
        await flush();
        assert.equal(result, undefined);

        (globalThis as unknown as { window: Window }).window.dispatchEvent({
            type: SETTLED_EVENT,
        } as Event);
        await flush();
        assert.deepEqual(result, { settled: true });
    } finally {
        restoreGlobals();
    }
});

test("host-signal mode still waits when MutationObserver is unavailable", async () => {
    const clock = new FakeClock();
    installSettleGlobals(clock);
    Object.defineProperty(globalThis, "MutationObserver", {
        configurable: true,
        value: undefined,
    });
    try {
        let result: { settled: boolean } | undefined;
        void settleDom(
            { quietMs: 200, maxWaitMs: 1600, waitForNavigationSignal: true },
            undefined,
            true,
        ).then((settled) => {
            result = settled;
        });

        clock.advance(800);
        await flush();
        assert.equal(result, undefined);

        (globalThis as unknown as { window: Window }).window.dispatchEvent({
            type: SETTLED_EVENT,
        } as Event);
        await flush();
        assert.deepEqual(result, { settled: true });
    } finally {
        restoreGlobals();
    }
});

test("host-signal mode marks a cap-hit capture as unsettled", async () => {
    const clock = new FakeClock();
    installSettleGlobals(clock);
    try {
        const captured = captureSettledPageContext(
            [],
            { quietMs: 50, maxWaitMs: 100, waitForNavigationSignal: true },
            undefined,
            true,
        );

        clock.advance(100);
        const context = await captured;
        assert.equal(context.snapshot?.unsettled, true);
    } finally {
        restoreGlobals();
    }
});

test("an aborted round-trip stops the wait immediately", async () => {
    const clock = new FakeClock();
    installSettleGlobals(clock);
    try {
        const controller = new AbortController();
        let result: { settled: boolean } | undefined;
        void settleDom({ quietMs: 200, maxWaitMs: 1600 }, controller.signal).then((r) => {
            result = r;
        });
        controller.abort();
        await flush();
        assert.deepEqual(result, { settled: true });
        assert.equal(clock.timers.size, 0);
    } finally {
        restoreGlobals();
    }
});

test("falls back to a two-frame wait without MutationObserver", async () => {
    Reflect.deleteProperty(globalThis, "MutationObserver");
    let frames = 0;
    Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: (callback: FrameRequestCallback) => {
            frames += 1;
            callback(0);
            return frames;
        },
    });
    try {
        const result = await settleDom(DEFAULT_SETTLE);
        assert.deepEqual(result, { settled: true });
        assert.equal(frames, 2);
    } finally {
        restoreGlobals();
    }
});

test("captureSettledPageContext flags a cap-hit capture as unsettled", async () => {
    const clock = new FakeClock();
    installSettleGlobals(clock);
    try {
        const capped = captureSettledPageContext([], { quietMs: 200, maxWaitMs: 100 });
        clock.advance(100);
        const cappedContext = await capped;
        assert.equal(cappedContext.snapshot?.unsettled, true);

        const settled = captureSettledPageContext([], { quietMs: 50, maxWaitMs: 1000 });
        clock.advance(50);
        const settledContext = await settled;
        assert.equal(settledContext.snapshot?.unsettled, undefined);
    } finally {
        restoreGlobals();
    }
});
