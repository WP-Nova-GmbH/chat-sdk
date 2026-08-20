---
id: api-reference
title: API reference
---

## Global Dispatcher

The script-tag build installs `window.WpNova`. Calls made before the SDK loads are queued and replayed in order.

```ts
WpNova("init", config);
WpNova("open");
WpNova("close");
WpNova("toggle");
WpNova("registerTool", tool);
WpNova("unregisterTool", name);
WpNova("destroy");
```

## npm Helpers

```ts
import {
  WpNova,
  init,
  open,
  close,
  toggle,
  isOpen,
  subscribeOpenChange,
  destroy,
  registerTool,
  unregisterTool,
  setPageReady,
  retain,
  release,
  defineElement,
  ELEMENT_TAG,
  OPEN_CHANGE_EVENT,
  SIDEBAR_RESIZE_EVENT,
  WpNovaChatElement,
  DEFAULT_SETTLE,
  SETTLED_EVENT,
  type ChatPresentation,
  type HostTheme,
  type SidebarResizeDetail,
  type SettleOptions,
  type SiteCapabilitiesConfig,
  type SiteCapabilitiesProvider,
} from "@wp-nova/chat-sdk";
```

`WpNova(command, ...args)` and the named helpers call the same singleton controller.

## Panel Controls

The SDK-owned launcher is enabled by default. Set `launcher: false` when the
host page provides its own button, then control the same singleton panel through
`open()`, `close()`, or `toggle()`. Calls made before `init()` are retained and
applied when the element mounts.

```ts
import { init, toggle } from "@wp-nova/chat-sdk";

init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  launcher: false,
});

document.querySelector("#assistant")?.addEventListener("click", toggle);
```

`isOpen()` returns the current state. `subscribeOpenChange(listener)` reports
transitions from every source, including the iframe minimize control, and
returns an unsubscribe function. The mounted custom element also emits a
bubbling `wp-nova:open-change` event with `{ open: boolean }` in `detail`.

## SdkConfig

```ts
export type HostTheme = "light" | "dark";

export type ChatPresentation =
  | { mode?: "popover" }
  | { mode: "sidebar"; width?: number; resizable?: boolean };

export type SiteCapabilitiesProvider = () => unknown | Promise<unknown>;

export interface SiteCapabilitiesConfig {
  provider: SiteCapabilitiesProvider;
  description?: string;
}

export interface SdkConfig {
  publicSurfaceId: string;
  tokenEndpoint: string;
  baseUrl?: string;
  mount?: string | HTMLElement;
  presentation?: ChatPresentation;
  title?: string;
  accent?: string;
  triggerColor?: string;
  triggerColorLight?: string;
  triggerColorDark?: string;
  triggerIconColor?: "light" | "dark" | string;
  launcher?: boolean;
  theme?: HostTheme;
  safeValueSelectors?: string[];
  voiceMode?: boolean;
  ui?: "current" | "classic";
  locale?: string;
  routes?: SiteRoute[];
  siteCapabilities?: SiteCapabilitiesConfig;
  pageWorkflows?: PageWorkflowDefinition[];
  settle?: {
    quietMs?: number;
    maxWaitMs?: number;
    waitForNavigationSignal?: boolean;
  };
  protocolVersion?: number;
}

export interface SiteRoute {
  path: string; // same-origin path, may contain :param placeholders
  description: string;
}
```

Required fields:

- `publicSurfaceId`: non-secret `surf_...` handle from Nova admin.
- `tokenEndpoint`: your backend route that proxies Nova `POST /embed/session`.

Every other field is optional. `theme` defaults to `light` and forwards the host
page's current color mode to the iframe without reading an iframe-owned cookie.
Changing it through another `init` call updates the existing iframe in place
without acquiring a new token. Notably, `voiceMode` (default `false`) enables
the embedded voice button and delegates microphone access to the Nova iframe.
`ui` (default `"current"`) selects the chat design; `"classic"` pins the design
that shipped before the rework. It is decided when the iframe is built, so
changing it rebuilds the frame and ends the open conversation — see
[Chat design](./configuration.md#chat-design).
`siteCapabilities` enables the reserved, read-only `get_site_capabilities` tool;
Nova supplies its default model instruction and the host provider supplies its
live JSON-serializable result. The optional description override must contain
20–2,000 characters.
See [Configuration](./configuration.md) for the full options table.

`locale` is an optional BCP 47 host locale. The SDK canonicalizes it and passes
host, document, and browser language signals in page context. `pageWorkflows`
contains exact path-triggered `research-and-compose` definitions; see
[Automatic page workflows](./page-workflows.md).

`presentation` defaults to `{ mode: "popover" }`. Sidebar width defaults to
`384`, numeric values are clamped to `320–640`, and invalid runtime widths warn
and fall back to `384`. Sidebar mode requires an explicit, resolvable `mount`.
Its effective mode falls back to pop-over whenever the mount is narrower than
`sidebarWidth + 384px`. Sidebar width is fixed unless `resizable: true`; then
the built-in separator supports pointer and keyboard resizing and emits
`wp-nova:sidebar-resize` with `SidebarResizeDetail` after each committed
change.

`settle` controls post-action snapshot readiness. Defaults are
`quietMs: 200`, `maxWaitMs: 1600`, and
`waitForNavigationSignal: false`. See
[Navigation and async pages](./navigation.md).

## Page Tools

```ts
export type ToolHandler = (
  args: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
) => unknown | Promise<unknown>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutating: boolean;
  confirmationCopy?: string;
  handler: ToolHandler;
}
```

Handler results must be JSON-serializable. The SDK captures a fresh snapshot
after a successful handler. Handler failures are reported as typed bridge errors.
The optional `opts.signal` is an `AbortSignal` the SDK aborts when the bridge times
the tool round-trip out, so a cooperating handler can stop a long-running or
mutating action.

Registration validates that the name matches `^[a-z][a-z0-9_]*$`, does not
collide with a built-in action, the description is at least 20 characters,
`inputSchema` is a plain object, `mutating` is boolean, and mutating tools
have non-empty `confirmationCopy`. Nova applies additional bounded size and
complexity checks. See [Tools and guided workflows](./tools.md).

`get_site_capabilities` is also reserved. Configure it through
`SdkConfig.siteCapabilities`; do not pass it to `registerTool`.

`registerToolHandler(name, handler)` and `unregisterToolHandler(name)` remain
available as deprecated execution-only compatibility helpers. Handler-only tools
are not advertised to the agent.

## Token Endpoint Contract

The SDK request:

```http
POST /api/nova-token
Content-Type: application/json

{ "publicSurfaceId": "surf_...", "origin": "https://app.example.com" }
```

The SDK sends credentials with the request so your own session cookie is included.

Your endpoint returns one of these Nova responses:

```ts
export interface TokenGrantResponse {
  access_token: string;
  expires_in: number;
  displaySettings?: {
    title?: string;
    logo?: string;
    accent?: string;
    triggerColor?: string;
    triggerIconColor?: string;
  } | null;
  developmentMode?: boolean;
  unavailable?: false;
}
```

```ts
export interface UnavailableUserResponse {
  unavailable: true;
  email: string;
  message: string;
  message_is_custom?: boolean;
  access_request_token?: string;
  access_request_expires_in?: number;
  user_creation_required?: boolean;
  user_creation_token?: string;
  user_creation_expires_in?: number;
  access_token?: undefined;
}
```

`message_is_custom: false` identifies Nova's built-in message, which the iframe
localizes. A value of `true` identifies administrator-authored copy that is shown
verbatim.

Nova emits either the access-request capability pair or the confirmed-JIT
creation capability pair; these capability families are never combined in a
platform response. The structural SDK type remains permissive so a proxy can
forward additive fields unchanged.

Return Nova's complete unresolved response without rewriting its status or fields.
The optional capability powers the administrator access-request action and is not
a chat credential. An explicitly discriminated `{ unavailable: true }` body is
recognized even if an intermediary rewrites the status; other non-2xx and malformed
bodies are token transport errors.

## Page Context Types

```ts
export interface PageContext {
  url: string;
  path?: string;
  title?: string;
  selection?: string;
  structuredData?: {
    jsonLd?: unknown[];
    meta?: Record<string, string>;
  };
  aiFields?: Record<string, string | undefined>;
  languageSignals?: {
    hostLocale?: string;
    documentLocale?: string;
    browserLocales?: string[];
  };
  siteRoutes?: SiteRoute[];
  snapshot?: VisiblePageSnapshot;
}

export interface VisiblePageSnapshot {
  visibleText?: string;
  links?: VisibleLink[];
  controls?: VisibleControl[];
  // Metadata for visible field values the privacy policy withheld:
  // labels/types/reasons only, never the value itself.
  omittedValues?: OmittedFieldValue[];
  handles?: ElementHandle[];
  truncated?: boolean;
  partial?: boolean;
  // The post-action settle wait hit its hard cap.
  unsettled?: boolean;
}
```

Handles are valid only for the snapshot that issued them. Every tool result returns a fresh snapshot with re-issued handles.

## Page Workflow Types

The following structural types describe `SdkConfig.pageWorkflows`:

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type WorkflowToolReference =
  | { location: "site"; toolId: string; contractVersion: string }
  | { location: "backend"; connectionKey: string; toolId: string; contractVersion: string };

type WorkflowInputBinding =
  | { kind: "literal"; value: JsonValue }
  | { kind: "path"; parameter: string };

type WorkflowOutputAssertion =
  | { pointer: string; operator: "exists" | "nonEmpty" }
  | { pointer: string; operator: "equals"; value: JsonValue };

interface PageWorkflowAvailableBackendTool {
  connectionKey: string;
  toolId: string;
  contractVersion: string;
}

interface PageWorkflowExecution {
  mode: "research-and-compose";
  availableBackendTools?: PageWorkflowAvailableBackendTool[];
}

interface PageWorkflowRequiredTool {
  id: string;
  tool: WorkflowToolReference;
  inputs: Record<string, WorkflowInputBinding>;
  outputAssertions?: WorkflowOutputAssertion[];
}

export interface PageWorkflowDefinition {
  id: string;
  path: string;
  execution: PageWorkflowExecution;
  prompt: string;
  requiredTools?: PageWorkflowRequiredTool[];
}

export interface PageWorkflowEvidenceSource {
  id: string;
  label: string;
  description?: string;
  observedAt?: string;
}

export interface PageWorkflowEvidenceEnvelope {
  sources: PageWorkflowEvidenceSource[];
}

export type PageWorkflowCitationOrigin =
  | "page"
  | "required-tool"
  | "backend-tool"
  | "connector";

export interface PageWorkflowCitationSource {
  reference: string;
  origin: PageWorkflowCitationOrigin;
  title: string;
  description: string;
  observedAt?: string;
}
```

`JsonValue` is JSON-serializable data. Required-tool assertions use RFC 6901
JSON pointers. Evidence ids are internal; model-facing references are opaque
values such as `[source:s1]`. The evidence and citation interfaces are exported
from the package root. The smaller workflow helper types above are structural
configuration types; import `PageWorkflowDefinition` when a named type is
needed.

## Post-Action Settle API

```ts
export interface SettleOptions {
  quietMs: number;
  maxWaitMs: number;
  waitForNavigationSignal?: boolean;
}

export const DEFAULT_SETTLE: SettleOptions;
export const SETTLED_EVENT = "wp-nova:settled";

export function setPageReady(ready: boolean): void;
```

`quietMs` is clamped to 0–1000 and `maxWaitMs` to
`quietMs`–5000. A capped wait sets `VisiblePageSnapshot.unsettled`.

## Custom Element

The SDK defines `<wp-nova-chat>` lazily and idempotently. You can pre-place the
element in the DOM, but most integrations should let `init` create and mount
it. The element reflects requested and responsive presentation as
`data-wpn-presentation` and `data-wpn-effective-presentation`; the validated
width is available internally as `--wpn-sidebar-width`.
`data-wpn-sidebar-resizable` reflects the opt-in resize handle.

An effective sidebar panel is a labelled `complementary` region. An effective
pop-over keeps its non-modal `dialog` semantics. `data-wp-nova-ignore` excludes
the SDK subtree from host page snapshots without hiding either presentation
from the accessibility tree.

```ts
import { ELEMENT_TAG, defineElement } from "@wp-nova/chat-sdk";

defineElement();
console.log(ELEMENT_TAG); // "wp-nova-chat"
```

## Browser Events

`wp-nova:navigate` is a cancelable `CustomEvent<{ url: string }>` sent before
same-origin document navigation. `wp-nova:settled` ends a pending post-action
wait after the requested route and data render. See
[Navigation and async pages](./navigation.md) for the router adapter.

`wp-nova:sidebar-resize` is a bubbling, composed
`CustomEvent<SidebarResizeDetail>` with `{ width: number }`. It fires when an
opt-in sidebar pointer drag commits and after every supported keyboard resize.
Use `SIDEBAR_RESIZE_EVENT` instead of repeating the event-name string in npm
integrations. The event reports the effective clamped width; pass it back as
`presentation.width` to persist the user's choice across later `init()` calls.

## Shared Mount Lifecycle

`retain()` and `release()` are primarily for framework-wrapper authors. Pair
every retained mount with a release; the singleton element is removed only when
the last mount releases. Application integrations normally use the React or
Angular wrapper, or call `init()` and `destroy()` directly.
