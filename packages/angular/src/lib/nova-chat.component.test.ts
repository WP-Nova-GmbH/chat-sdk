import { Injector, runInInjectionContext, SimpleChange, type SimpleChanges } from "@angular/core";
import type { ToolDefinition } from "@wp-nova/chat-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NovaChatComponent } from "./nova-chat.component";
import { NovaChatService } from "./nova-chat.service";

const ELEMENT_TAG = "wp-nova-chat";

/**
 * A faithful stand-in for the app-wide singleton NovaChatService: retain/release
 * drive a shared refcount + a single shared `<wp-nova-chat>` element, exactly like
 * the real service delegating to the SDK controller. This lets the wrapper tests
 * assert that one mount's teardown does NOT remove another mount's live element.
 */
function makeSharedService() {
    let refs = 0;
    const state = { teardownCount: 0 };
    const ensureElement = () => {
        if (!document.querySelector(ELEMENT_TAG)) {
            document.body.appendChild(document.createElement(ELEMENT_TAG));
        }
    };
    const teardown = () => {
        const el = document.querySelector(ELEMENT_TAG);
        if (el) {
            el.remove();
            state.teardownCount++;
        }
    };
    const service = {
        init: vi.fn(() => ensureElement()),
        registerTool: vi.fn(),
        unregisterTool: vi.fn(),
        registerToolHandler: vi.fn(),
        unregisterToolHandler: vi.fn(),
        retain: vi.fn(() => {
            refs++;
        }),
        release: vi.fn(() => {
            if (refs > 0) refs--;
            if (refs === 0) teardown();
        }),
        destroy: vi.fn(() => teardown()),
    };
    return {
        service,
        state,
        get refs() {
            return refs;
        },
    };
}

function mountComponent(service: Partial<NovaChatService>): NovaChatComponent {
    const injector = Injector.create({
        providers: [{ provide: NovaChatService, useValue: service }],
    });
    return runInInjectionContext(injector, () => new NovaChatComponent());
}

function changeOf(...keys: string[]): SimpleChanges {
    const changes: SimpleChanges = {};
    for (const key of keys) changes[key] = new SimpleChange(undefined, undefined, false);
    return changes;
}

function tool(name: string, overrides: Partial<ToolDefinition> = {}): ToolDefinition {
    return {
        name,
        description: `desc ${name}`,
        inputSchema: {},
        mutating: false,
        handler: () => undefined,
        ...overrides,
    };
}

const config = { publicSurfaceId: "surface", tokenEndpoint: "/token" };

afterEach(() => {
    document.body.innerHTML = "";
});

describe("NovaChatComponent — R1 shared-singleton teardown", () => {
    it("keeps the shared element alive when one of two mounts is destroyed", () => {
        const shared = makeSharedService();
        const first = mountComponent(shared.service);
        const second = mountComponent(shared.service);

        first.config = { ...config };
        second.config = { ...config };
        first.ngOnInit();
        second.ngOnInit();

        expect(shared.service.retain).toHaveBeenCalledTimes(2);
        expect(shared.refs).toBe(2);
        expect(document.querySelectorAll(ELEMENT_TAG)).toHaveLength(1);

        // Tear down the first mount: refcount drops to 1, the shared element (the
        // second mount's live chat) MUST survive and teardown must not run.
        first.ngOnDestroy();
        expect(shared.service.release).toHaveBeenCalledTimes(1);
        expect(shared.refs).toBe(1);
        expect(document.querySelectorAll(ELEMENT_TAG)).toHaveLength(1);
        expect(shared.state.teardownCount).toBe(0);

        // Tear down the second (last) mount: now the element is removed exactly once.
        second.ngOnDestroy();
        expect(shared.service.release).toHaveBeenCalledTimes(2);
        expect(shared.refs).toBe(0);
        expect(document.querySelector(ELEMENT_TAG)).toBeNull();
        expect(shared.state.teardownCount).toBe(1);
        expect(shared.service.destroy).not.toHaveBeenCalled();
    });

    it("keeps the shared element alive when one of two mounts is disabled", () => {
        const shared = makeSharedService();
        const first = mountComponent(shared.service);
        const second = mountComponent(shared.service);

        first.config = { ...config };
        second.config = { ...config };
        first.ngOnInit();
        second.ngOnInit();
        expect(document.querySelectorAll(ELEMENT_TAG)).toHaveLength(1);

        // Disable the first mount (enabled -> false): release once, element survives.
        first.enabled = false;
        first.ngOnChanges(changeOf("enabled"));
        expect(shared.service.release).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll(ELEMENT_TAG)).toHaveLength(1);
        expect(shared.state.teardownCount).toBe(0);

        // Disabling again must NOT double-release (retained flag guards it).
        first.ngOnChanges(changeOf("enabled"));
        expect(shared.service.release).toHaveBeenCalledTimes(1);

        // Last live mount unmounts -> teardown runs exactly once.
        second.ngOnDestroy();
        expect(document.querySelector(ELEMENT_TAG)).toBeNull();
        expect(shared.state.teardownCount).toBe(1);
    });
});

describe("NovaChatComponent — R4 change-aware sync", () => {
    let service: ReturnType<typeof makeSharedService>["service"];

    beforeEach(() => {
        service = makeSharedService().service;
    });

    it("does not re-init or re-register tools on an unrelated change", () => {
        const component = mountComponent(service);
        component.config = { ...config };
        component.tools = [tool("alpha")];
        component.ngOnInit();

        expect(service.init).toHaveBeenCalledTimes(1);
        expect(service.registerTool).toHaveBeenCalledTimes(1);
        vi.clearAllMocks();

        // A SimpleChanges that touches neither config/enabled nor tools must be inert.
        component.ngOnChanges(changeOf("somethingElse"));
        expect(service.init).not.toHaveBeenCalled();
        expect(service.registerTool).not.toHaveBeenCalled();
        expect(service.unregisterTool).not.toHaveBeenCalled();
    });

    it("re-inits on a config change without re-emitting REGISTER_TOOLS", () => {
        const component = mountComponent(service);
        component.config = { ...config };
        component.tools = [tool("alpha")];
        component.ngOnInit();
        vi.clearAllMocks();

        component.config = { ...config, title: "Renamed" };
        component.ngOnChanges(changeOf("config"));

        expect(service.init).toHaveBeenCalledTimes(1);
        // Tools did not change, so the tool registry is left untouched.
        expect(service.registerTool).not.toHaveBeenCalled();
        expect(service.unregisterTool).not.toHaveBeenCalled();
    });

    it("re-registers only the tool delta when tools change", () => {
        const component = mountComponent(service);
        component.config = { ...config };
        const alpha = tool("alpha");
        const beta = tool("beta");
        component.tools = [alpha, beta];
        component.ngOnInit();
        expect(service.registerTool).toHaveBeenCalledTimes(2);
        vi.clearAllMocks();

        // beta is unchanged (same content + handler); alpha removed; gamma added.
        component.tools = [beta, tool("gamma")];
        component.ngOnChanges(changeOf("tools"));

        expect(service.unregisterTool).toHaveBeenCalledTimes(1);
        expect(service.unregisterTool).toHaveBeenCalledWith("alpha");
        const registered = service.registerTool.mock.calls.map((args) => args[0].name);
        expect(registered).toEqual(["gamma"]);
        expect(registered).not.toContain("beta");
    });

    it("re-registers a tool whose content changed but keeps its name", () => {
        const component = mountComponent(service);
        component.config = { ...config };
        component.tools = [tool("alpha", { description: "v1" })];
        component.ngOnInit();
        vi.clearAllMocks();

        component.tools = [tool("alpha", { description: "v2" })];
        component.ngOnChanges(changeOf("tools"));

        expect(service.registerTool).toHaveBeenCalledTimes(1);
        expect(service.registerTool.mock.calls[0]?.[0].name).toBe("alpha");
        expect(service.unregisterTool).not.toHaveBeenCalled();
    });
});
