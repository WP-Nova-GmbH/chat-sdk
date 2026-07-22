# @wp-nova/chat-sdk

Framework-agnostic browser SDK for embedding Nova chat. It mounts a Nova-hosted
iframe and bridges visible page context, navigation, and integrator-defined tools.
Your backend holds the integration secret and mints short-lived embed sessions.

📖 **Documentation:** [https://wp-nova.ai/chat-sdk](https://wp-nova.ai/chat-sdk)

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
| `mount` | no | Host element/selector; defaults to `document.body`. |
| `title` | no | Pre-auth panel title. |
| `accent` | no | Pre-auth accent color. |
| `triggerColor` | no | Launcher color; defaults to `accent`. |
| `triggerColorLight` | no | Light-mode launcher color; overrides `triggerColor`. |
| `triggerColorDark` | no | Dark-mode launcher color; overrides `triggerColor`. |
| `triggerIconColor` | no | `light`, `dark`, or hex. |
| `theme` | no | Host page mode (`light` or `dark`); defaults to `light` and updates live. |
| `safeValueSelectors` | no | Selectors that opt safe field values into snapshots. |
| `voiceMode` | no | Enables voice and iframe microphone delegation. |
| `routes` | no | Permission-filtered `{ path, description }[]`, max 100. |
| `settle` | no | `quietMs`, `maxWaitMs`, and `waitForNavigationSignal`. |

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
```

Never trust browser-supplied identity or expose the integration secret. A bearer
SPA needs a protected bootstrap endpoint that creates an opaque `HttpOnly`
cookie session because the SDK does not inherit the app's bearer header.

The SDK refreshes proactively at about 80% of `expires_in` and reactively after
iframe `AUTH_EXPIRED`, always through `tokenEndpoint`.

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

See the [full documentation](https://wp-nova.ai/chat-sdk) for tool limits,
permissions, guided choices, structured errors, and idempotency.

## Runtime behavior

### Lifecycle

The mount is singleton-safe across duplicate `init`, HMR, and SPA remounts.
Changes to iframe identity (`publicSurfaceId`, `baseUrl`, `voiceMode`, or
`protocolVersion`) rebuild the frame and refresh auth. Use `destroy()` only when
removing chat; framework wrappers pair shared `retain()`/`release()` mounts.

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

## Bridge protocol

Host/iframe `postMessage` traffic uses exact origin/source checks, protocol
versions, correlation ids, and explicit error frames; the SDK never targets `*`.
