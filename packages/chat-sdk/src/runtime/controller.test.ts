import assert from "node:assert/strict";
import test from "node:test";

// Importing the controller transitively evaluates the custom-element class
// (`class extends HTMLElement`), so a stub must exist before the dynamic import.
const ORIGINAL_HTML_ELEMENT = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
const ORIGINAL_DOCUMENT = Object.getOwnPropertyDescriptor(globalThis, "document");

class FakeHTMLElement {
    setAttribute() {}
}

/** The singleton the exported retain/release/destroy helpers operate on. */
interface TestController {
    hasPendingOpenState: boolean;
    mountRefs: number;
    openChangeListeners: Set<(open: boolean) => void>;
    openState: boolean;
    pageReady: boolean;
    pageReadyUrl?: string;
    element?: {
        close?: () => void;
        destroy: () => void;
        isOpen?: boolean;
        open?: () => void;
        removeEventListener: () => void;
        setPageReady?: (ready: boolean, expectedUrl?: string) => void;
    };
    close: () => void;
    isOpen: () => boolean;
    onElementOpenChange: (event: Event) => void;
    open: () => void;
    retain: () => void;
    release: () => void;
    resolveMountTarget: (
        mount: string | HTMLElement | undefined,
        presentationMode: "popover" | "sidebar",
    ) => HTMLElement;
    subscribeOpenChange: (listener: (open: boolean) => void) => () => void;
    setPageReady: (ready: boolean) => void;
    toggle: () => void;
}

let retain: () => void;

test.before(async () => {
    Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        value: FakeHTMLElement,
    });
    ({ retain } = await import("./controller.js"));
});

test.after(() => {
    if (ORIGINAL_HTML_ELEMENT) {
        Object.defineProperty(globalThis, "HTMLElement", ORIGINAL_HTML_ELEMENT);
    } else {
        Reflect.deleteProperty(globalThis, "HTMLElement");
    }
    if (ORIGINAL_DOCUMENT) {
        Object.defineProperty(globalThis, "document", ORIGINAL_DOCUMENT);
    } else {
        Reflect.deleteProperty(globalThis, "document");
    }
});

function freshController(): TestController {
    // `retain()` creates the global singleton if absent; grab it to drive the
    // refcount directly (its fields are private to TS but present at runtime).
    retain();
    const controller = (globalThis as Record<string, unknown>).__wpNovaController__ as
        | TestController
        | undefined;
    assert.ok(controller, "expected the global SDK controller to exist");
    controller.mountRefs = 0;
    controller.openChangeListeners.clear();
    controller.openState = false;
    controller.hasPendingOpenState = false;
    controller.pageReady = false;
    controller.pageReadyUrl = undefined;
    controller.element = {
        destroy() {
            controller.element = undefined;
        },
        removeEventListener() {},
    };
    return controller;
}

test("release tears down the shared element only when the last mount releases", () => {
    const controller = freshController();
    let destroyed = 0;
    const element = controller.element;
    controller.element = {
        destroy() {
            destroyed++;
            element?.destroy();
        },
        removeEventListener() {},
    };

    controller.retain();
    controller.retain();
    assert.equal(controller.mountRefs, 2);

    // First release: a mount is still live, so the element survives.
    controller.release();
    assert.equal(controller.mountRefs, 1);
    assert.equal(destroyed, 0);

    // Last release: teardown runs exactly once and detaches the element.
    controller.release();
    assert.equal(controller.mountRefs, 0);
    assert.equal(destroyed, 1);
    assert.equal(controller.element, undefined);
});

test("release never underflows the refcount or re-tears-down a gone element", () => {
    const controller = freshController();
    let destroyed = 0;
    const element = controller.element;
    controller.element = {
        destroy() {
            destroyed++;
            element?.destroy();
        },
        removeEventListener() {},
    };

    controller.retain();
    controller.release();
    assert.equal(controller.mountRefs, 0);
    assert.equal(destroyed, 1);
    assert.equal(controller.element, undefined);

    // A stray release at 0 must not drive the count negative, and destroy() is a
    // no-op once the element is already gone (no second teardown).
    controller.release();
    assert.equal(controller.mountRefs, 0);
    assert.equal(destroyed, 1);
});

test("repeated retain stacks the refcount (retain/release are per-mount, not per-init)", () => {
    const controller = freshController();
    let destroyed = 0;
    const element = controller.element;
    controller.element = {
        destroy() {
            destroyed++;
            element?.destroy();
        },
        removeEventListener() {},
    };

    controller.retain();
    controller.retain();
    controller.retain();
    assert.equal(controller.mountRefs, 3);

    controller.release();
    controller.release();
    assert.equal(destroyed, 0);
    controller.release();
    assert.equal(destroyed, 1);
});

test("open, close and toggle are idempotent and publish real transitions", () => {
    const controller = freshController();
    const changes: boolean[] = [];
    const unsubscribe = controller.subscribeOpenChange((open) => changes.push(open));
    let elementOpen = false;
    controller.element = {
        get isOpen() {
            return elementOpen;
        },
        open() {
            elementOpen = true;
            controller.onElementOpenChange({
                detail: { open: true },
            } as unknown as Event);
        },
        close() {
            elementOpen = false;
            controller.onElementOpenChange({
                detail: { open: false },
            } as unknown as Event);
        },
        destroy() {
            elementOpen = false;
            controller.element = undefined;
        },
        removeEventListener() {},
    };

    controller.open();
    controller.open();
    assert.equal(controller.isOpen(), true);
    assert.equal(elementOpen, true);

    controller.toggle();
    controller.close();
    assert.equal(controller.isOpen(), false);
    assert.equal(elementOpen, false);
    assert.deepEqual(changes, [true, false]);

    unsubscribe();
    controller.open();
    assert.deepEqual(changes, [true, false]);
});

test("a failing open-state listener does not block the element or other subscribers", () => {
    const controller = freshController();
    const changes: boolean[] = [];
    let elementOpen = false;
    const originalError = console.error;
    const errors: unknown[][] = [];
    console.error = (...args: unknown[]) => void errors.push(args);
    controller.element = {
        get isOpen() {
            return elementOpen;
        },
        open() {
            elementOpen = true;
            controller.onElementOpenChange({
                detail: { open: true },
            } as unknown as Event);
        },
        destroy() {
            controller.element = undefined;
        },
        removeEventListener() {},
    };
    controller.subscribeOpenChange(() => {
        throw new Error("consumer failure");
    });
    controller.subscribeOpenChange((open) => changes.push(open));

    try {
        controller.open();
    } finally {
        console.error = originalError;
    }

    assert.equal(elementOpen, true);
    assert.equal(controller.isOpen(), true);
    assert.deepEqual(changes, [true]);
    assert.equal(String(errors[0]?.[0]).includes("consumer failure"), true);
});

test("an open request made before init is retained for the eventual element", () => {
    const controller = freshController();
    controller.element = undefined;

    controller.open();

    assert.equal(controller.isOpen(), true);
    assert.equal(controller.hasPendingOpenState, true);
});

test("page readiness records the exact URL and clears explicitly", () => {
    const controller = freshController();
    const signals: Array<[boolean, string | undefined]> = [];
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { location: { href: "https://app.example/interventions/abc" } },
    });
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {},
    });
    controller.element = {
        destroy() {
            controller.element = undefined;
        },
        removeEventListener() {},
        setPageReady(ready, expectedUrl) {
            signals.push([ready, expectedUrl]);
        },
    };

    controller.setPageReady(true);
    controller.setPageReady(false);

    assert.deepEqual(signals, [
        [true, "https://app.example/interventions/abc"],
        [false, undefined],
    ]);
    assert.equal(controller.pageReady, false);
    assert.equal(controller.pageReadyUrl, undefined);
});

test("sidebar mount resolution requires an explicit, resolvable layout container", () => {
    const controller = freshController();
    const body = new FakeHTMLElement() as unknown as HTMLElement;
    const layout = new FakeHTMLElement() as unknown as HTMLElement;
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
            body,
            querySelector(selector: string) {
                return selector === "#nova-layout" ? layout : null;
            },
        },
    });

    assert.equal(controller.resolveMountTarget("#nova-layout", "sidebar"), layout);
    assert.throws(
        () => controller.resolveMountTarget(undefined, "sidebar"),
        /requires an explicit `mount` layout container/,
    );
    assert.throws(
        () => controller.resolveMountTarget("#missing", "sidebar"),
        /could not resolve its `mount` selector "#missing"/,
    );
});

test("pop-over keeps the body fallback for omitted or unresolved mounts", () => {
    const controller = freshController();
    const body = new FakeHTMLElement() as unknown as HTMLElement;
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
            body,
            querySelector() {
                return null;
            },
        },
    });

    assert.equal(controller.resolveMountTarget(undefined, "popover"), body);
    assert.equal(controller.resolveMountTarget("#missing", "popover"), body);
});
