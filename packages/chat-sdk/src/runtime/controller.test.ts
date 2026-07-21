import assert from "node:assert/strict";
import test from "node:test";

// Importing the controller transitively evaluates the custom-element class
// (`class extends HTMLElement`), so a stub must exist before the dynamic import.
const ORIGINAL_HTML_ELEMENT = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");

class FakeHTMLElement {}

/** The singleton the exported retain/release/destroy helpers operate on. */
interface TestController {
    mountRefs: number;
    element?: { destroy: () => void };
    retain: () => void;
    release: () => void;
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
    controller.element = {
        destroy() {
            controller.element = undefined;
        },
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
