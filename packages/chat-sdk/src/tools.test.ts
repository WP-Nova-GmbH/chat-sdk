import assert from "node:assert/strict";
import test from "node:test";
import { ToolRegistry } from "./tools.js";
import type { ToolDefinition } from "./types.js";

const ORIGINALS = {
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    getComputedStyle: Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle"),
    location: Object.getOwnPropertyDescriptor(globalThis, "location"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
};

const validTool = (overrides: Partial<ToolDefinition> = {}): ToolDefinition => ({
    name: "create_ticket",
    description: "Creates a support ticket from the current customer context.",
    inputSchema: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
    },
    mutating: true,
    confirmationCopy: "Create this ticket?",
    handler: async (args) => ({ ok: true, title: args.title }),
    ...overrides,
});

function restoreGlobals(): void {
    for (const [key, descriptor] of Object.entries(ORIGINALS)) {
        if (descriptor) {
            Object.defineProperty(globalThis, key, descriptor);
        } else {
            Reflect.deleteProperty(globalThis, key);
        }
    }
}

function installEmptyDom(): void {
    const body = { children: [] };
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
            body,
            children: [],
            documentElement: { clientHeight: 800, clientWidth: 1200 },
            querySelectorAll: () => [],
            title: "Host App",
        },
    });
    Object.defineProperty(globalThis, "getComputedStyle", {
        configurable: true,
        value: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    });
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href: "https://host.example/customers", pathname: "/customers" },
    });
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            innerHeight: 800,
            innerWidth: 1200,
            getSelection: () => "",
        },
    });
}

test.afterEach(() => {
    restoreGlobals();
});

test("registerTool advertises full SDK tool specs", () => {
    const registry = new ToolRegistry();
    const changes: unknown[] = [];
    registry.setOnChange((tools) => changes.push(tools));

    registry.register(validTool());

    assert.deepEqual(registry.advertisedTools(), [
        {
            name: "create_ticket",
            description: "Creates a support ticket from the current customer context.",
            args_schema: {
                type: "object",
                properties: { title: { type: "string" } },
                required: ["title"],
            },
            mutating: true,
            confirmationCopy: "Create this ticket?",
        },
    ]);
    assert.equal(changes.length, 1);
});

test("unregisterTool removes the advertised spec", () => {
    const registry = new ToolRegistry();
    registry.register(validTool());
    registry.unregister("create_ticket");

    assert.deepEqual(registry.advertisedTools(), []);
});

test("registered tool execution returns handler result and a fresh snapshot", async () => {
    installEmptyDom();
    const registry = new ToolRegistry();
    registry.register(validTool());

    const result = await registry.run({
        name: "create_ticket",
        args: { title: "Printer is down" },
    });

    assert.deepEqual(result.result, { ok: true, title: "Printer is down" });
    assert.equal(result.snapshot?.url, "https://host.example/customers");
    assert.equal(result.snapshot?.title, "Host App");
});

test("registerToolHandler is execution-only and does not advertise tools", async () => {
    installEmptyDom();
    const registry = new ToolRegistry();
    registry.registerHandler("legacy_ticket", async () => ({ ok: true }));

    assert.deepEqual(registry.advertisedTools(), []);
    const result = await registry.run({ name: "legacy_ticket", args: {} });
    assert.deepEqual(result.result, { ok: true });
});

test("registerTool rejects invalid or unsafe definitions", () => {
    const registry = new ToolRegistry();

    assert.throws(() => registry.register(validTool({ name: "Click Me" })), /lowercase letters/);
    assert.throws(() => registry.register(validTool({ name: "click" })), /reserved/);
    assert.throws(
        () => registry.register(validTool({ description: "too short" })),
        /at least 20 characters/,
    );
    assert.throws(
        () =>
            registry.register(validTool({ inputSchema: [] as unknown as Record<string, unknown> })),
        /inputSchema/,
    );
    assert.throws(
        () => registry.register(validTool({ mutating: true, confirmationCopy: undefined })),
        /confirmationCopy/,
    );
});
