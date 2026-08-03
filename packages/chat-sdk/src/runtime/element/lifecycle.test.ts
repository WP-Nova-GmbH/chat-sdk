import assert from "node:assert/strict";
import test from "node:test";
import { type ResolvedConfig, resolveConfig } from "../../config/config.js";
import type { EmbedFrame, SdkFrame } from "../../protocol/types/index.js";
import { EMBED_SOURCE } from "../../protocol/types/index.js";
import { SITE_CAPABILITIES_TOOL_NAME, ToolRegistry } from "../../tools/tools.js";
import {
    makeElement,
    resetElementTestGlobals,
    resolvedConfig,
    setupElementTests,
    teardownElementTests,
} from "./test-support.js";

test.before(setupElementTests);
test.after(teardownElementTests);
test.afterEach(resetElementTestGlobals);

test("config changes that target a different iframe reset bridge and buffered auth", () => {
    let stopped = false;
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: { stop: () => void };
        lastAuth?: unknown;
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            baseUrl?: string;
            accent?: string;
            voiceMode?: boolean;
        }) => void;
    };
    element.resolved = resolvedConfig();
    element.bridge = {
        stop: () => {
            stopped = true;
        },
    };
    element.lastAuth = { kind: "granted", token: "old-token", expiresIn: 60 };

    element.setConfig({
        publicSurfaceId: "surf_2",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        accent: "#222222",
    });

    assert.equal(stopped, true);
    assert.equal(element.bridge, undefined);
    assert.equal(element.lastAuth, undefined);
    assert.equal(element.resolved?.iframeSrc.includes("surface=surf_2"), true);
});

test("config changes that toggle voice mode reset the iframe", () => {
    let stopped = false;
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: { stop: () => void };
        lastAuth?: unknown;
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            baseUrl?: string;
            voiceMode?: boolean;
        }) => void;
    };
    element.resolved = resolvedConfig();
    element.bridge = {
        stop: () => {
            stopped = true;
        },
    };
    element.lastAuth = { kind: "granted", token: "old-token", expiresIn: 60 };

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        baseUrl: "https://chat.wp-nova.ai",
        voiceMode: true,
    });

    assert.equal(stopped, true);
    assert.equal(element.bridge, undefined);
    assert.equal(element.lastAuth, undefined);
    assert.equal(element.resolved?.voiceModeEnabled, true);
    assert.equal(new URL(element.resolved?.iframeSrc ?? "").searchParams.get("voice"), "1");
});

test("siteCapabilities config advertises and removes the SDK-defined lookup in place", () => {
    const registry = new ToolRegistry();
    const element = makeElement() as {
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            siteCapabilities?: {
                provider: () => unknown;
            };
        }) => void;
        setRegistry: (registry: ToolRegistry) => void;
    };
    element.setRegistry(registry);

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        siteCapabilities: {
            provider: () => ({ features: ["Prepare renewal summary"] }),
        },
    });

    assert.equal(registry.advertisedTools()[0]?.name, SITE_CAPABILITIES_TOOL_NAME);

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
    });

    assert.deepEqual(registry.advertisedTools(), []);
});

test("READY protocol range must include the SDK protocol", () => {
    const element = makeElement() as {
        isProtocolCompatible: (
            config: ResolvedConfig,
            minVersion?: number,
            maxVersion?: number,
        ) => boolean;
    };
    const config = resolvedConfig({ protocolVersion: 2 });

    assert.equal(element.isProtocolCompatible(config, 1, 3), true);
    assert.equal(element.isProtocolCompatible(config, 3, 4), false);
    assert.equal(element.isProtocolCompatible(config, 0, 1), false);
});

test("a ready workflow starts only after the authenticated capable chat opens", () => {
    const href = "https://app.example/call-center/interventions/abc";
    const starts: Array<{
        correlationId: string;
        workflow: { id: string };
        expectedUrl: string;
    }> = [];
    const openStates: boolean[] = [];
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: {
            sendHostOpenState: (open: boolean) => void;
            sendStartPageWorkflow: (
                correlationId: string,
                workflow: { id: string },
                expectedUrl: string,
            ) => void;
        };
        iframeReady: boolean;
        pageWorkflowCapable: boolean;
        lastAuth?: unknown;
        open: () => void;
        setPageReady: (ready: boolean, expectedUrl?: string) => void;
    };
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href, origin: "https://app.example", pathname: "/call-center/interventions/abc" },
    });
    element.resolved = resolvedConfig({
        protocolVersion: 2,
        pageWorkflows: [
            {
                id: "summarize-intervention",
                path: "/call-center/interventions/:interventionId",
                prompt: "Summarize the call",
                execution: { mode: "research-and-compose" },
            },
        ],
    });
    element.bridge = {
        sendHostOpenState: (open) => openStates.push(open),
        sendStartPageWorkflow: (correlationId, workflow, expectedUrl) =>
            starts.push({ correlationId, workflow, expectedUrl }),
    };
    element.iframeReady = true;
    element.pageWorkflowCapable = true;
    element.lastAuth = { kind: "granted", token: "token", expiresIn: 900 };

    element.setPageReady(true);
    assert.equal(starts.length, 0);

    element.open();

    assert.deepEqual(openStates, [true]);
    assert.equal(starts.length, 1);
    assert.equal(starts[0]?.workflow.id, "summarize-intervention");
    assert.equal(starts[0]?.expectedUrl, href);
});

test("readiness loss cancels a sent workflow but never cancels a started run", () => {
    const href = "https://app.example/interventions/abc";
    const starts: string[] = [];
    const cancellations: string[] = [];
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: {
            sendHostOpenState: () => void;
            sendStartPageWorkflow: (correlationId: string) => void;
            sendCancelPageWorkflow: (correlationId: string) => void;
        };
        iframeReady: boolean;
        pageWorkflowCapable: boolean;
        lastAuth?: unknown;
        pageWorkflowAttempt?: { correlationId: string; status: string };
        handlePageWorkflowStatus: (correlationId: string, status: "started") => void;
        isWorkflowSnapshotRequestValid: (correlationId: string) => boolean;
        open: () => void;
        close: () => void;
        setPageReady: (ready: boolean) => void;
    };
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href, origin: "https://app.example", pathname: "/interventions/abc" },
    });
    element.resolved = resolvedConfig({
        pageWorkflows: [
            {
                id: "summary",
                path: "/interventions/:id",
                prompt: "Summarize",
                execution: { mode: "research-and-compose" },
            },
        ],
    });
    element.bridge = {
        sendHostOpenState: () => undefined,
        sendStartPageWorkflow: (correlationId) => starts.push(correlationId),
        sendCancelPageWorkflow: (correlationId) => cancellations.push(correlationId),
    };
    element.iframeReady = true;
    element.pageWorkflowCapable = true;
    element.lastAuth = { kind: "granted", token: "token", expiresIn: 900 };
    element.setPageReady(true);
    element.open();

    const sent = starts[0];
    assert.ok(sent);
    assert.equal(element.isWorkflowSnapshotRequestValid(sent), true);

    element.setPageReady(false);
    assert.deepEqual(cancellations, [sent]);
    assert.equal(element.isWorkflowSnapshotRequestValid(sent), false);
    assert.equal(element.pageWorkflowAttempt, undefined);

    element.setPageReady(true);
    const started = starts[1];
    assert.ok(started);
    element.handlePageWorkflowStatus(started, "started");
    element.close();
    element.setPageReady(false);

    assert.deepEqual(cancellations, [sent]);
});

test("an unacknowledged workflow retries with the same correlation id", () => {
    const href = "https://app.example/interventions/abc";
    const starts: string[] = [];
    const timerCallbacks: Array<() => void> = [];
    Object.defineProperty(globalThis, "setTimeout", {
        configurable: true,
        value: (callback: () => void) => {
            timerCallbacks.push(callback);
            return timerCallbacks.length;
        },
    });
    Object.defineProperty(globalThis, "clearTimeout", {
        configurable: true,
        value: () => undefined,
    });
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: {
            sendHostOpenState: () => void;
            sendStartPageWorkflow: (correlationId: string) => void;
            sendCancelPageWorkflow: () => void;
        };
        iframeReady: boolean;
        pageWorkflowCapable: boolean;
        lastAuth?: unknown;
        open: () => void;
        setPageReady: (ready: boolean) => void;
    };
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href, origin: "https://app.example", pathname: "/interventions/abc" },
    });
    element.resolved = resolvedConfig({
        pageWorkflows: [
            {
                id: "summary",
                path: "/interventions/:id",
                prompt: "Summarize",
                execution: { mode: "research-and-compose" },
            },
        ],
    });
    element.bridge = {
        sendHostOpenState: () => undefined,
        sendStartPageWorkflow: (correlationId) => starts.push(correlationId),
        sendCancelPageWorkflow: () => undefined,
    };
    element.iframeReady = true;
    element.pageWorkflowCapable = true;
    element.lastAuth = { kind: "granted", token: "token", expiresIn: 900 };
    element.setPageReady(true);
    element.open();

    assert.equal(starts.length, 1);
    timerCallbacks[0]?.();

    assert.equal(starts.length, 2);
    assert.equal(starts[1], starts[0]);
});

test("stale ready URLs never start after SPA navigation", () => {
    const locationState = {
        href: "https://app.example/call-center/interventions/abc",
        origin: "https://app.example",
        pathname: "/call-center/interventions/abc",
    };
    let starts = 0;
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: {
            sendHostOpenState: () => void;
            sendStartPageWorkflow: () => void;
        };
        iframeReady: boolean;
        pageWorkflowCapable: boolean;
        lastAuth?: unknown;
        open: () => void;
        setPageReady: (ready: boolean) => void;
    };
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: locationState,
    });
    element.resolved = resolvedConfig({
        pageWorkflows: [
            {
                id: "summary",
                path: "/call-center/interventions/:id",
                prompt: "Summarize",
                execution: { mode: "research-and-compose" },
            },
        ],
    });
    element.bridge = {
        sendHostOpenState: () => undefined,
        sendStartPageWorkflow: () => {
            starts++;
        },
    };
    element.iframeReady = true;
    element.pageWorkflowCapable = true;
    element.lastAuth = { kind: "granted", token: "token", expiresIn: 900 };

    element.setPageReady(true);
    locationState.href = "https://app.example/dashboard";
    locationState.pathname = "/dashboard";
    element.open();

    assert.equal(starts, 0);
});

test("skipped attempts retry on a later open transition without looping while open", () => {
    const href = "https://app.example/interventions/abc";
    const correlations: string[] = [];
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: {
            sendHostOpenState: () => void;
            sendStartPageWorkflow: (correlationId: string) => void;
        };
        iframeReady: boolean;
        pageWorkflowCapable: boolean;
        lastAuth?: unknown;
        close: () => void;
        handlePageWorkflowStatus: (correlationId: string, status: "skipped") => void;
        open: () => void;
        setPageReady: (ready: boolean) => void;
    };
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href, origin: "https://app.example", pathname: "/interventions/abc" },
    });
    element.resolved = resolvedConfig({
        pageWorkflows: [
            {
                id: "summary",
                path: "/interventions/:id",
                prompt: "Summarize",
                execution: { mode: "research-and-compose" },
            },
        ],
    });
    element.bridge = {
        sendHostOpenState: () => undefined,
        sendStartPageWorkflow: (correlationId) => correlations.push(correlationId),
    };
    element.iframeReady = true;
    element.pageWorkflowCapable = true;
    element.lastAuth = { kind: "granted", token: "token", expiresIn: 900 };
    element.setPageReady(true);
    element.open();
    const first = correlations[0];
    assert.ok(first);

    element.handlePageWorkflowStatus(first, "skipped");
    assert.equal(correlations.length, 1);

    element.close();
    element.open();
    assert.equal(correlations.length, 2);
    assert.notEqual(correlations[1], first);
});

test("closing an unacknowledged workflow cancels it before a later open retries", () => {
    const href = "https://app.example/interventions/abc";
    const correlations: string[] = [];
    const cancellations: string[] = [];
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: {
            sendHostOpenState: () => void;
            sendStartPageWorkflow: (correlationId: string) => void;
            sendCancelPageWorkflow: (correlationId: string) => void;
        };
        iframeReady: boolean;
        pageWorkflowCapable: boolean;
        lastAuth?: unknown;
        close: () => void;
        handlePageWorkflowStatus: (correlationId: string, status: "skipped") => void;
        open: () => void;
        setPageReady: (ready: boolean) => void;
    };
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href, origin: "https://app.example", pathname: "/interventions/abc" },
    });
    element.resolved = resolvedConfig({
        pageWorkflows: [
            {
                id: "summary",
                path: "/interventions/:id",
                prompt: "Summarize",
                execution: { mode: "research-and-compose" },
            },
        ],
    });
    element.bridge = {
        sendHostOpenState: () => undefined,
        sendStartPageWorkflow: (correlationId) => correlations.push(correlationId),
        sendCancelPageWorkflow: (correlationId) => cancellations.push(correlationId),
    };
    element.iframeReady = true;
    element.pageWorkflowCapable = true;
    element.lastAuth = { kind: "granted", token: "token", expiresIn: 900 };
    element.setPageReady(true);
    element.open();
    const first = correlations[0];
    assert.ok(first);

    element.close();
    element.open();
    assert.deepEqual(cancellations, [first]);
    assert.equal(correlations.length, 2);

    element.handlePageWorkflowStatus(first, "skipped");
    assert.equal(correlations.length, 2);
});

test("live host theme changes reuse the bridge and iframe", () => {
    const sentThemes: string[] = [];
    const panelShadows: string[] = [];
    let stopped = false;
    let tokenAcquisitions = 0;
    const initial = resolveConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        theme: "light",
        triggerColor: "#444444",
        triggerColorLight: "#eeeeee",
        triggerColorDark: "#111111",
    });
    const bridge = {
        sendHostTheme: (theme: string) => sentThemes.push(theme),
        stop: () => {
            stopped = true;
        },
    };
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: typeof bridge;
        iframeReady: boolean;
        isConnected: boolean;
        style: { setProperty: (name: string, value: string) => void };
        shell: {
            frame?: unknown;
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
        };
        acquireToken: () => Promise<void>;
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            theme: "light" | "dark";
            triggerColor: string;
            triggerColorLight: string;
            triggerColorDark: string;
        }) => void;
    };
    element.resolved = initial;
    const launcherColors: string[] = [];
    element.style.setProperty = (name, value) => {
        if (name === "--wpn-panel-shadow") panelShadows.push(value);
        if (name === "--wpn-accent") launcherColors.push(value);
    };
    element.shell.applyConfig(initial);
    element.shell.render(initial);
    element.bridge = bridge;
    element.iframeReady = true;
    element.isConnected = true;
    element.acquireToken = async () => {
        tokenAcquisitions++;
    };
    const iframe = element.shell.frame;

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        theme: "dark",
        triggerColor: "#444444",
        triggerColorLight: "#eeeeee",
        triggerColorDark: "#111111",
    });

    assert.equal(stopped, false);
    assert.equal(element.bridge, bridge);
    assert.equal(element.shell.frame, iframe);
    assert.equal(tokenAcquisitions, 0);
    assert.deepEqual(sentThemes, ["dark"]);
    assert.equal(launcherColors[0], "#eeeeee");
    assert.equal(launcherColors[launcherColors.length - 1], "#111111");
    assert.equal(launcherColors.includes("#444444"), false);
    assert.deepEqual(panelShadows, [
        "0 1px 2px rgba(22,18,42,.05),0 22px 50px -18px rgba(22,18,42,.30)",
        "0 1px 2px rgba(0,0,0,.40),0 18px 44px -16px rgba(0,0,0,.60)",
    ]);
    assert.equal(element.resolved?.theme, "dark");
});

test("live token-endpoint changes reuse the iframe but acquire fresh auth", () => {
    let tokenAcquisitions = 0;
    const initial = resolveConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token-a",
    });
    const bridge = {
        sendHostTheme: (_theme: string) => undefined,
        sendHostOpenState: (_open: boolean) => undefined,
        stop: () => undefined,
    };
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: typeof bridge;
        iframeReady: boolean;
        isConnected: boolean;
        shell: { frame?: unknown; render: (config: ResolvedConfig) => void };
        acquireToken: () => Promise<void>;
        setConfig: (config: { publicSurfaceId: string; tokenEndpoint: string }) => void;
    };
    element.resolved = initial;
    element.shell.render(initial);
    element.bridge = bridge;
    element.iframeReady = true;
    element.isConnected = true;
    element.acquireToken = async () => {
        tokenAcquisitions++;
    };
    const iframe = element.shell.frame;

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token-b",
    });

    assert.equal(element.bridge, bridge);
    assert.equal(element.shell.frame, iframe);
    assert.equal(tokenAcquisitions, 1);
    assert.equal(element.resolved?.tokenEndpoint, "/token-b");
});

test("token-endpoint changes revoke the old workflow grant before restart checks", () => {
    const href = "https://app.example/interventions/abc";
    const workflow = {
        id: "summary",
        path: "/interventions/:id",
        prompt: "Summarize",
        execution: { mode: "research-and-compose" as const },
    };
    const starts: string[] = [];
    const cancellations: string[] = [];
    const initial = resolveConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token-a",
        pageWorkflows: [workflow],
    });
    const bridge = {
        sendHostTheme: () => undefined,
        sendHostOpenState: () => undefined,
        sendStartPageWorkflow: (correlationId: string) => starts.push(correlationId),
        sendCancelPageWorkflow: (correlationId: string) => cancellations.push(correlationId),
        stop: () => undefined,
    };
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: typeof bridge;
        iframeReady: boolean;
        pageWorkflowCapable: boolean;
        isConnected: boolean;
        lastAuth?: unknown;
        shell: { render: (config: ResolvedConfig) => void };
        acquireToken: () => Promise<void>;
        open: () => void;
        setPageReady: (ready: boolean) => void;
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            pageWorkflows: Array<typeof workflow>;
        }) => void;
    };
    Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: { href, origin: "https://app.example", pathname: "/interventions/abc" },
    });
    element.resolved = initial;
    element.shell.render(initial);
    element.bridge = bridge;
    element.iframeReady = true;
    element.pageWorkflowCapable = true;
    element.isConnected = true;
    element.lastAuth = { kind: "granted", token: "old-token", expiresIn: 900 };
    element.acquireToken = async () => undefined;
    element.setPageReady(true);
    element.open();
    const initialCorrelation = starts[0];
    assert.ok(initialCorrelation);

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token-b",
        pageWorkflows: [workflow],
    });

    assert.equal(element.lastAuth, undefined);
    assert.deepEqual(cancellations, [initialCorrelation]);
    assert.equal(starts.length, 1);
});

test("presentation switches preserve the open frame, bridge, auth, tools, and token schedule", () => {
    let tokenAcquisitions = 0;
    const initial = resolveConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
    });
    const bridge = {
        sendHostTheme: (_theme: string) => undefined,
        sendHostOpenState: (_open: boolean) => undefined,
        stop: () => undefined,
    };
    const auth = { kind: "granted", token: "existing-token", expiresIn: 60 };
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: typeof bridge;
        iframeReady: boolean;
        isConnected: boolean;
        isOpen: boolean;
        lastAuth?: unknown;
        registry: unknown;
        tokenTimers: unknown;
        shell: {
            frame?: unknown;
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
        };
        acquireToken: () => Promise<void>;
        close: () => void;
        open: () => void;
        setConfig: (config: {
            publicSurfaceId: string;
            tokenEndpoint: string;
            presentation?:
                | { mode: "popover" }
                | { mode: "sidebar"; width?: number; resizable?: boolean };
        }) => void;
    };
    element.resolved = initial;
    element.shell.applyConfig(initial);
    element.shell.render(initial);
    element.bridge = bridge;
    element.iframeReady = true;
    element.isConnected = true;
    element.lastAuth = auth;
    element.acquireToken = async () => {
        tokenAcquisitions++;
    };
    element.open();
    const iframe = element.shell.frame;
    const registry = element.registry;
    const tokenTimers = element.tokenTimers;

    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        presentation: { mode: "sidebar", width: 512, resizable: true },
    });
    assert.equal(element.resolved?.presentationMode, "sidebar");
    assert.equal(element.resolved?.sidebarWidth, 512);
    assert.equal(element.resolved?.sidebarResizable, true);
    assert.equal(element.isOpen, true);
    assert.equal(element.shell.frame, iframe);
    assert.equal(element.bridge, bridge);
    assert.equal(element.lastAuth, auth);
    assert.equal(element.registry, registry);
    assert.equal(element.tokenTimers, tokenTimers);
    assert.equal(tokenAcquisitions, 0);

    element.close();
    element.setConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        presentation: { mode: "popover" },
    });
    assert.equal(element.resolved?.presentationMode, "popover");
    assert.equal(element.isOpen, false);
    assert.equal(element.shell.frame, iframe);
    assert.equal(element.bridge, bridge);
    assert.equal(element.lastAuth, auth);
    assert.equal(tokenAcquisitions, 0);
});

test("controlled relocation suppresses disconnect and reconnect side effects", () => {
    const first = new HTMLElement();
    const second = new HTMLElement();
    const element = makeElement() as {
        boot: () => void;
        moveTo: (target: HTMLElement) => void;
        tokenTimers: { clear: () => void };
    };
    let boots = 0;
    let timerClears = 0;
    element.boot = () => {
        boots++;
    };
    element.tokenTimers.clear = () => {
        timerClears++;
    };
    first.appendChild(element as unknown as Node);
    boots = 0;

    element.moveTo(second);

    assert.equal(boots, 0);
    assert.equal(timerClears, 0);
});

test("READY receives the current host theme before the iframe renders auth state", () => {
    let messageListener: ((event: MessageEvent) => void) | undefined;
    const posted: Array<{ frame: SdkFrame; origin: string }> = [];
    const iframeWindow = {
        postMessage(frame: SdkFrame, origin: string) {
            posted.push({ frame, origin });
        },
    } as unknown as Window;
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            addEventListener(_name: string, listener: (event: MessageEvent) => void) {
                messageListener = listener;
            },
            removeEventListener() {
                messageListener = undefined;
            },
        },
    });

    const config = resolveConfig({
        publicSurfaceId: "surf_1",
        tokenEndpoint: "/token",
        theme: "dark",
    });
    const element = makeElement() as {
        resolved?: ResolvedConfig;
        bridge?: { start: () => void; stop: () => void };
        iframeReady: boolean;
        shell: {
            frame?: { contentWindow?: Window; dispatch: (name: string, event: Event) => void };
            applyConfig: (config: ResolvedConfig) => void;
            render: (config: ResolvedConfig) => void;
        };
        wireBridge: (config: ResolvedConfig) => void;
    };
    element.resolved = config;
    element.shell.applyConfig(config);
    element.shell.render(config);
    if (element.shell.frame) element.shell.frame.contentWindow = iframeWindow;
    element.wireBridge(config);
    element.bridge?.start();

    messageListener?.({
        origin: config.iframeOrigin,
        source: iframeWindow,
        data: {
            source: EMBED_SOURCE,
            protocolVersion: config.protocolVersion,
            type: "READY",
            minProtocolVersion: config.protocolVersion,
            maxProtocolVersion: config.protocolVersion,
        } satisfies EmbedFrame,
    } as MessageEvent);

    assert.deepEqual(posted[0], {
        frame: {
            source: "wp-nova-ext",
            protocolVersion: config.protocolVersion,
            type: "HOST_THEME",
            theme: "dark",
        },
        origin: config.iframeOrigin,
    });

    // READY may arrive from the new document before the parent receives its
    // iframe load event. The post-load READY must establish the final session.
    element.shell.frame?.dispatch("load", {} as Event);
    assert.equal(element.iframeReady, false);
    messageListener?.({
        origin: config.iframeOrigin,
        source: iframeWindow,
        data: {
            source: EMBED_SOURCE,
            protocolVersion: config.protocolVersion,
            type: "READY",
            minProtocolVersion: config.protocolVersion,
            maxProtocolVersion: config.protocolVersion,
        } satisfies EmbedFrame,
    } as MessageEvent);
    assert.equal(element.iframeReady, true);
    assert.equal(posted.filter(({ frame }) => frame.type === "HOST_THEME").length, 2);
    element.bridge?.stop();
});
