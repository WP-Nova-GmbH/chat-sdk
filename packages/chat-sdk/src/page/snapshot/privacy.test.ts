import assert from "node:assert/strict";
import test from "node:test";
import { capturePageContext, captureVisiblePageSnapshot } from "./index.js";
import { FakeDocument, FakeElement, restoreGlobals } from "./test-support.js";

test("an ignored SDK shell does not advertise controls or make the snapshot partial", () => {
    const document = new FakeDocument();
    const sdk = new FakeElement(
        "wp-nova-chat",
        new Map([["data-wp-nova-ignore", ""]]),
        "",
        document,
    );
    const launcher = new FakeElement("button", new Map(), "Open assistant", document);
    const iframe = new FakeElement("iframe", new Map(), "", document);
    sdk.append(launcher);
    sdk.append(iframe);
    document.body.append(sdk);

    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            getSelection: () => "",
        },
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href: "https://app.example/", pathname: "/" },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: () => ({ display: "block", opacity: "1", visibility: "visible" }),
    });

    try {
        const snapshot = captureVisiblePageSnapshot();

        assert.equal(snapshot.partial ?? false, false);
        assert.deepEqual(snapshot.controls ?? [], []);
        assert.equal(snapshot.visibleText?.includes("Open assistant") ?? false, false);
    } finally {
        restoreGlobals();
    }
});

test("data-ai-context respects ignore, viewport, sensitivity, and caps", () => {
    const document = new FakeDocument();
    const included = new FakeElement(
        "div",
        new Map([["data-ai-context", "summary"]]),
        "Visible summary",
        document,
    );
    const ignored = new FakeElement(
        "div",
        new Map([
            ["data-ai-context", "ignored"],
            ["data-wp-nova-ignore", ""],
        ]),
        "Should not leak",
        document,
    );
    const offscreen = new FakeElement(
        "div",
        new Map([["data-ai-context", "offscreen"]]),
        "Offscreen context",
        document,
    );
    const sensitive = new FakeElement(
        "div",
        new Map([["data-ai-context", "secret_token"]]),
        "Sensitive context",
        document,
    );
    const long = new FakeElement(
        "div",
        new Map([["data-ai-context", "long"]]),
        "x".repeat(700),
        document,
    );
    offscreen.rect = { bottom: 1020, height: 20, left: 0, right: 200, top: 1000, width: 200 };
    document.allNodes = [included, ignored, offscreen, sensitive, long];
    document.body.append(included);
    document.body.append(ignored);
    document.body.append(offscreen);
    document.body.append(sensitive);
    document.body.append(long);

    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            getSelection: () => "",
        },
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href: "https://app.example/customers", pathname: "/customers" },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: () => ({ display: "block", opacity: "1", visibility: "visible" }),
    });

    try {
        const context = capturePageContext();

        assert.equal(context.aiFields?.summary, "Visible summary");
        assert.equal(context.aiFields?.ignored, undefined);
        assert.equal(context.aiFields?.offscreen, undefined);
        assert.equal(context.aiFields?.secret_token, undefined);
        assert.equal(context.aiFields?.long?.length, 500);
    } finally {
        restoreGlobals();
    }
});

test("field values omitted by policy are reported without leaking the value", () => {
    const document = new FakeDocument();
    const customerName = new FakeElement(
        "input",
        new Map([
            ["type", "text"],
            ["aria-label", "Customer name"],
        ]),
        "",
        document,
    );
    customerName.value = "Ada Lovelace";
    const password = new FakeElement(
        "input",
        new Map([
            ["type", "password"],
            ["aria-label", "Portal password"],
        ]),
        "",
        document,
    );
    password.value = "swordfish";
    const city = new FakeElement(
        "input",
        new Map([
            ["type", "text"],
            ["aria-label", "City"],
            ["data-wp-nova-include", ""],
        ]),
        "",
        document,
    );
    city.value = "Berlin";
    document.body.append(customerName);
    document.body.append(password);
    document.body.append(city);

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
        const serialized = JSON.stringify(snapshot);

        assert.equal(serialized.includes("Ada Lovelace"), false);
        assert.equal(serialized.includes("swordfish"), false);
        assert.equal(serialized.includes("Berlin"), true);
        assert.deepEqual(
            snapshot.omittedValues?.map(({ label, reason }) => ({ label, reason })),
            [
                { label: "Customer name", reason: "not_opted_in" },
                { label: "Portal password", reason: "sensitive" },
            ],
        );
    } finally {
        restoreGlobals();
    }
});

test("target context does not include field-like text withheld by policy", () => {
    const document = new FakeDocument();
    const row = new FakeElement("tr", new Map(), "", document);
    const idCell = new FakeElement("td", new Map(), "HF-219", document);
    const notes = new FakeElement(
        "div",
        new Map([
            ["contenteditable", ""],
            ["aria-label", "Internal notes"],
        ]),
        "do not leak this note",
        document,
    );
    const button = new FakeElement("button", new Map(), "Select", document);
    row.append(idCell);
    row.append(notes);
    row.append(button);
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
        const selectControl = snapshot.controls?.find((control) => control.label === "Select");

        assert.equal(selectControl?.context, "HF-219");
        assert.equal(JSON.stringify(snapshot).includes("do not leak this note"), false);
    } finally {
        restoreGlobals();
    }
});

test("page context omits raw mainHtml so ignored markup cannot bypass field policy", () => {
    const document = new FakeDocument();
    const main = new FakeElement(
        "main",
        new Map(),
        "Visible customer Password: swordfish",
        document,
    );
    const ignored = new FakeElement(
        "input",
        new Map([
            ["type", "hidden"],
            ["value", "secret"],
            ["data-wp-nova-ignore", ""],
        ]),
        "",
        document,
    );
    main.append(ignored);
    document.body.append(main);

    Object.defineProperty(globalThis, "document", { configurable: true, value: document });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            getSelection: () => "",
        },
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href: "https://app.example/customers", pathname: "/customers" },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: () => ({ display: "block", opacity: "1", visibility: "visible" }),
    });

    try {
        const context = capturePageContext();

        assert.equal("mainHtml" in context, false);
        assert.notEqual(context.snapshot?.visibleText?.includes("swordfish"), true);
    } finally {
        restoreGlobals();
    }
});
