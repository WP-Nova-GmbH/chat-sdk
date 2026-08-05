# @wp-nova/chat-sdk

Framework-agnostic browser SDK for embedding Nova chat. It mounts a Nova-hosted
iframe and bridges visible page context, navigation, and integrator-defined tools.
Your backend holds the integration secret and mints short-lived embed sessions.

📖 **Documentation:** [https://chat.wp-nova.ai](https://chat.wp-nova.ai)

## Install

### Script tag

Calls made before the global bundle loads are queued and replayed in order.

| Channel | URL | Cache | SRI |
| --- | --- | --- | --- |
| Immutable (recommended) | `https://chat.wp-nova.ai/sdk/<version>/sdk.js` | long-lived | required |
| Rolling | `https://chat.wp-nova.ai/sdk/v1/sdk.js` | no-cache | unavailable |

Use the immutable URL with the exact hash published at
`/sdk/<version>/sdk.js.sri` or shown in Nova admin.

```html
<script>
  (function (w, d, s) {
    w.WpNova = w.WpNova || function () { (w.WpNova.q = w.WpNova.q || []).push(arguments); };
    var j = d.createElement(s); j.async = 1;
    j.src = "https://chat.wp-nova.ai/sdk/<version>/sdk.js";
    j.crossOrigin = "anonymous";
    j.integrity = "sha384-<published hash>";
    d.head.appendChild(j);
  })(window, document, "script");

  WpNova("init", {
    publicSurfaceId: "surf_…",
    tokenEndpoint: "/api/nova-token",
  });
</script>
```

The rolling channel changes over time and therefore cannot use SRI.

### npm

```bash
npm install @wp-nova/chat-sdk
```

```ts
import { init } from "@wp-nova/chat-sdk";

init({ publicSurfaceId: "surf_…", tokenEndpoint: "/api/nova-token" });
```

## Configuration

| Field | Required | Purpose |
| --- | --- | --- |
| `publicSurfaceId` | yes | Non-secret `surf_…` handle. |
| `tokenEndpoint` | yes | Customer backend endpoint that mints embed sessions. |
| `baseUrl` | no | Nova iframe origin; defaults to `https://chat.wp-nova.ai`. |
| `mount` | sidebar only | Host element/selector. Pop-over defaults to `document.body`; sidebar requires an explicit layout container. |
| `presentation` | no | `{ mode: "popover" }` (default) or `{ mode: "sidebar", width?: number, resizable?: boolean }`. |
| `title` | no | Pre-auth panel title. |
| `accent` | no | Pre-auth accent color. |
| `triggerColor` | no | Launcher color; defaults to `accent`. |
| `triggerColorLight` | no | Light-mode launcher color; overrides `triggerColor`. |
| `triggerColorDark` | no | Dark-mode launcher color; overrides `triggerColor`. |
| `triggerIconColor` | no | `light`, `dark`, or hex. |
| `launcher` | no | Show the SDK-owned launcher; defaults to `true`. |
| `theme` | no | Host page mode (`light` or `dark`); defaults to `light` and updates live. |
| `locale` | no | Explicit BCP 47 host-language hint included in page context for automatic workflows; it does not control iframe localization. |
| `safeValueSelectors` | no | Selectors that opt safe field values into snapshots. |
| `voiceMode` | no | Enables voice and iframe microphone delegation. |
| `routes` | no | Permission-filtered `{ path, description }[]`, max 100. |
| `siteCapabilities` | no | Live host result for Nova's SDK-defined capability-discovery tool. |
| `pageWorkflows` | no | Exact page-triggered `research-and-compose` definitions. |
| `settle` | no | `quietMs`, `maxWaitMs`, and `waitForNavigationSignal`. |

## Pop-over or docked sidebar

The same singleton iframe can render as the default fixed pop-over or as a
column in a host-owned grid/flex layout:

```html
<div id="nova-layout">
  <main><!-- application content --></main>
</div>

<style>
  #nova-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 100dvh;
    align-items: stretch;
  }
  #nova-layout > main { min-width: 0; }
</style>
```

```ts
init({
  publicSurfaceId: "surf_…",
  tokenEndpoint: "/api/nova-token",
  mount: "#nova-layout",
  presentation: { mode: "sidebar", width: 420, resizable: true },
});
```

Sidebar width defaults to `384px`; finite values are clamped to `320–640px`.
Omit `resizable` (or set it to `false`) for a fixed width. With
`resizable: true`, an accessible separator supports pointer dragging, arrow
keys, Home, and End. Committed changes emit a bubbling
`wp-nova:sidebar-resize` event with `{ width }`; store that value and pass it
back on later `init()` calls when the user's choice should persist.
The SDK falls back to pop-over when the mount cannot fit the sidebar plus
`384px` of main content, and returns to docked mode when space is available.
Call `init()` again with a different `presentation` or `mount` to switch in
place without replacing the iframe, token, tools, open state, or conversation.
The host owns column order, vertical sizing, sticky offsets, and animation.

## Host-owned launcher

Set `launcher: false` and control the singleton panel from your own UI:

```ts
import { init, toggle } from "@wp-nova/chat-sdk";

init({
  publicSurfaceId: "surf_…",
  tokenEndpoint: "/api/nova-token",
  launcher: false,
});

document.querySelector("#assistant")?.addEventListener("click", toggle);
```

The global build supports `WpNova("open")`, `WpNova("close")`, and
`WpNova("toggle")`. Use `subscribeOpenChange()` or the bubbling
`wp-nova:open-change` event to keep host UI synchronized.

## Backend token contract

The SDK posts `{ publicSurfaceId, origin }` to `tokenEndpoint` with
`credentials: "include"`. Authenticate the host user, read email from trusted
server state, validate the configured surface and exact origin, call Nova
`POST /embed/session` with the server-only integration secret, and pass the full
response/status through.

```jsonc
{ "access_token": "<embedded-session token>", "expires_in": 900 }

// Unmatched email: valid unavailable state, not a chat token
{
  "unavailable": true,
  "email": "user@acme.com",
  "message": "No Nova account for this email.",
  "message_is_custom": false,
  "access_request_token": "<purpose-scoped capability>",
  "access_request_expires_in": 3600
}

// JIT-enabled unmatched email: the iframe asks before creating the user
{
  "unavailable": true,
  "email": "user@acme.com",
  "message": "No Nova account for this email.",
  "user_creation_required": true,
  "user_creation_token": "<purpose-scoped capability>",
  "user_creation_expires_in": 3600
}
```

Never trust browser-supplied identity or expose the integration secret. A bearer
SPA needs a protected bootstrap endpoint that creates an opaque `HttpOnly`
cookie session because the SDK does not inherit the app's bearer header.

The SDK refreshes proactively at about 80% of `expires_in` and reactively after
iframe `AUTH_EXPIRED`, always through `tokenEndpoint`.

An unresolved response may also contain `user_creation_required`,
`user_creation_token`, and `user_creation_expires_in` when the surface allows
confirmed JIT creation. The iframe asks for confirmation, calls the scoped
creation endpoint, and then refreshes a normal chat session. `existing_only`
surfaces continue to use `access_request_token`; pass all fields through
unchanged and never accept browser-supplied identity.

## Site capability discovery

The current routes and callable tools are not a complete product description.
Provide a live capability guide so Nova can accurately answer "what can you do
here?", including automatic workflows and future host features:

```ts
init({
  publicSurfaceId: "surf_…",
  tokenEndpoint: "/api/nova-token",
  siteCapabilities: {
    provider: () => ({
      features: ["Search customers", "Create support tickets"],
      automaticWorkflows: [
        "Prepare a renewal summary when an eligible customer page opens",
      ],
    }),
  },
});
```

The SDK advertises a reserved, read-only `get_site_capabilities` tool. Nova owns
its default description, which requires a call before capability answers; the
host owns only the permission-aware, JSON-serializable provider result. Page
Tools must be enabled on the surface. Advanced integrations may override
`siteCapabilities.description` with a 20–2,000-character instruction that
preserves the same mandatory lookup behavior.

## Integrator tools

Define the contract and handler together. Nova admin supplies the Page Tools
allow/deny gate.

```ts
import { registerTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "create_ticket",
  description: "Creates a support ticket from the current customer context.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  mutating: true,
  confirmationCopy: "Create this ticket?",
  handler: async (args) => myApp.createTicket(args),
});
```

- Register before or after `init`; registry changes are sent to the iframe.
- Mutations require `confirmationCopy` and are confirmed before execution.
- Missing handlers return typed `no_handler` errors.
- `registerToolHandler` remains execution-only compatibility and does not
  advertise a tool.

See the [full documentation](https://chat.wp-nova.ai) for tool limits,
permissions, guided choices, structured errors, and idempotency.

## Runtime behavior

### Lifecycle

The mount is singleton-safe across duplicate `init`, HMR, and SPA remounts.
Changes to iframe identity (`publicSurfaceId`, `baseUrl`, `voiceMode`, or
`protocolVersion`) rebuild the frame and refresh auth. Use `destroy()` only when
removing chat; framework wrappers pair shared `retain()`/`release()` mounts.
Presentation and mount changes move/restyle the existing element without
resetting the frame or authentication state.

### Page snapshots

Snapshots contain visible structure, text, links, controls, selection, safe
field values, and snapshot-scoped handles—not screenshots or raw HTML. Field
values are default-deny: opt in with `data-wp-nova-include` or
`safeValueSelectors`; sensitivity checks still exclude credentials, payment,
token, account, and similar values. `data-wp-nova-ignore` excludes a subtree.
Partial or oversized captures are marked `partial`/`truncated`.

### Navigation and readiness

With Page Navigation enabled, Nova can use:

| Action | Confirmation |
| --- | --- |
| `navigate`, `set_filter`, `scroll_to`, `refresh_context` | no |
| `click`, `open_record` | yes |

`highlight` is reserved but not advertised. Actions use the latest snapshot
handles and return a fresh snapshot; stale targets return `stale_handle`.

Declare permission-filtered same-origin routes for direct navigation:

```ts
init({
  publicSurfaceId: "surf_…",
  tokenEndpoint: "/api/nova-token",
  routes: [
    { path: "/customers", description: "Customer lookup list with search." },
    { path: "/customers/:customerId", description: "Customer detail; obtain the id from /customers." },
  ],
  settle: { maxWaitMs: 5000, waitForNavigationSignal: true },
});
```

The SDK emits cancelable `wp-nova:navigate` before same-origin document
navigation. An SPA may prevent it and use its router. After async route data
renders, dispatch `wp-nova:settled`. Default post-action settling is 200 ms of
DOM quiet with a 1600 ms cap; cap-hit snapshots are marked `unsettled`.

### Automatic page workflows

Configure `pageWorkflows` with an exact pathname template, a
`research-and-compose` execution, optional deterministic `requiredTools`, and
read-only `availableBackendTools`. Call the exported `setPageReady(false)` while
matching route data is loading and `setPageReady(true)` after it renders. The
workflow starts only while chat is open, authenticated, iframe-ready, and
capable; same-URL readiness refreshes preserve an in-flight run. Backend tools
run server-side with `connectionKey`/`toolId`/`contractVersion` catalogs—there is
no browser handler. Results may include opaque evidence references such as
`[source:s1]`. See the [automatic page workflows guide](https://chat.wp-nova.ai/page-workflows).

## Bridge protocol

Host/iframe `postMessage` traffic uses exact origin/source checks, protocol
versions, correlation ids, and explicit error frames; the SDK never targets `*`.
