# @wp-nova/sdk

Framework-agnostic browser SDK that embeds the Nova Ark chat into a customer-owned
web app. The SDK mounts a Nova-hosted iframe (`<baseUrl>/embed/chat`) inside a
Shadow-DOM shell on the host page and bridges three things to it over
`postMessage`: the **page snapshot**, **navigation** actions, and
**integrator-defined tools**. The iframe owns the chat UI; the SDK is a thin,
dependency-free executor.

> The SDK never sees a tenant secret and never talks to Nova directly. It fetches
> a short-lived embedded-session token from **your** backend (`tokenEndpoint`),
> which holds the integration secret.

## Install

### Script tag (CDN)

Drop the install snippet on any page. Calls made before the SDK finishes loading
are buffered and replayed in order, so `registerToolHandler` calls placed before
`init` are preserved.

The CDN serves the SDK from `chat.wp-nova.ai` on two channels:

| Channel | URL | Cache | SRI |
| --- | --- | --- | --- |
| **Immutable (default)** | `https://chat.wp-nova.ai/sdk/<version>/sdk.js` | long-lived | **required** — pin with `integrity` |
| Rolling (opt-in) | `https://chat.wp-nova.ai/sdk/v1/sdk.js` | no-cache | not available |

**Use the immutable, version-pinned URL with a Subresource Integrity (SRI) hash.**
This is the default and recommended install: the bytes at `/sdk/<version>/sdk.js`
never change, so the browser can verify them against the `integrity` hash and
refuse to run a tampered bundle. The exact `integrity` value for each release is
published next to the file (`/sdk/<version>/sdk.js.sri`) and shown in the surface
admin install snippet.

```html
<script>
  (function (w, d, s) {
    w.WpNova = w.WpNova || function () { (w.WpNova.q = w.WpNova.q || []).push(arguments); };
    var j = d.createElement(s); j.async = 1;
    j.src = "https://chat.wp-nova.ai/sdk/1.0.0/sdk.js"; // immutable, pinned
    j.crossOrigin = "anonymous";
    j.integrity = "sha384-<published hash for this version>"; // SRI (required)
    d.head.appendChild(j);
  })(window, document, "script");

  // Register integrator tool handlers (optional; may run before init).
  WpNova("registerToolHandler", "create_ticket", function (args) {
    return myApp.createTicket(args);
  });

  // Boot the chat.
  WpNova("init", {
    publicSurfaceId: "srf_live_…",   // non-secret, SDK-facing surface handle
    tokenEndpoint: "/api/nova-token", // YOUR backend endpoint (see below)
  });
</script>
```

#### Rolling channel (opt-in, no SRI)

If you want the latest SDK without re-pinning on every release, use the rolling
`/sdk/v1/sdk.js` channel. Its contents change on each release, so **SRI cannot be
used** (a pinned `integrity` hash would break the moment the bundle rolls forward)
and it is served `no-cache`. This is an explicit opt-in — prefer the pinned URL
above unless you accept that the bytes can change under you.

```html
<script async src="https://chat.wp-nova.ai/sdk/v1/sdk.js"></script>
```

### npm

```bash
npm install @wp-nova/sdk
```

```ts
import { WpNova } from "@wp-nova/sdk";

WpNova("init", { publicSurfaceId: "srf_live_…", tokenEndpoint: "/api/nova-token" });
WpNova("registerToolHandler", "create_ticket", async (args) => myApp.createTicket(args));
```

## Init config

| Field             | Required | Description                                                                                  |
| ----------------- | -------- | -------------------------------------------------------------------------------------------- |
| `publicSurfaceId` | yes      | Non-secret, SDK-facing surface handle. The only identifier that crosses the browser boundary. |
| `tokenEndpoint`   | yes      | Your backend endpoint that mints an embedded-session token (see token contract).             |
| `baseUrl`         | no       | Base URL of the Nova-hosted iframe app. Defaults to `https://chat.wp-nova.ai`.               |
| `mount`           | no       | Host element (or selector) to mount into. Defaults to `document.body`.                       |
| `title`           | no       | Launcher / panel title shown before surface theming arrives.                                 |
| `accent`          | no       | Accent color for the pre-auth launcher shell.                                                |
| `triggerColor`    | no       | Launcher/open-button color for the pre-auth shell. Defaults to `accent`.                     |
| `triggerIconColor` | no      | Launcher icon color for the pre-auth shell. Use `light`, `dark`, or a hex color.             |
| `safeValueSelectors` | no    | Per-surface safe-value selector allowlist for the Visible Page Snapshot (see Page snapshot). |
| `voiceMode`       | no       | Opt in to embedded voice mode. When `true`, the SDK delegates microphone access to the iframe. Defaults to `false`. |

## Platform-backend token contract

The SDK **never** calls Nova directly and **never** holds the integration secret.
Instead it fetches a token from your own backend (`tokenEndpoint`). Your endpoint:

1. authenticates the current user with your own session, then
2. calls Nova's `POST /embed/session` with the **integration secret** and the
   authenticated user's **email** (the browser-asserted email is never trusted),
   and
3. returns the response straight through to the SDK.

The SDK `POST`s to your `tokenEndpoint` with `{ publicSurfaceId, origin }` (and
your session cookie, via `credentials: "include"`). Your endpoint must pass through
**both** `POST /embed/session` outcomes:

```jsonc
// Resolved user → short-lived token
{ "access_token": "<embedded-session token>", "expires_in": 900 }

// Unmatched email → unavailable state (no token; the iframe renders the message)
{ "unavailable": true, "email": "user@acme.com", "message": "No Nova account for this email." }
```

Passing the unavailable result through is required so the unavailable-user state
works without a token. A non-2xx / network failure is treated as a **transport
error** (distinct from the unavailable state) with bounded retry, backoff, and a
cooldown so a persistently-failing endpoint can't tight-loop.

## Auth refresh (AUTH_EXPIRED re-mint)

Embedded-session tokens are short-lived (~15 min). The SDK keeps the session alive
without a browser-held refresh token:

- **Proactive:** the SDK re-fetches a token from `tokenEndpoint` at ~80% of the
  token's `expires_in` and pushes a fresh `AUTH_TOKEN` to the iframe.
- **Reactive:** when the iframe hits a `401` it emits `AUTH_EXPIRED`; the SDK
  re-fetches from `tokenEndpoint` and re-pushes `AUTH_TOKEN`. The iframe retries
  the failed request once and does not drop an in-flight stream during the swap.

Because the iframe can't reach your cross-origin `tokenEndpoint` itself, the SDK
is always the re-mint path.

## Integrator tools

The set of tools the agent *can* call is declared **server-side** on the Embedded
Chat Surface — the browser cannot inject new agent tools. The SDK supplies matching
execution callbacks:

```ts
WpNova("registerToolHandler", "create_ticket", async (args) => {
  const ticket = await myApp.createTicket(args);
  return { ticketId: ticket.id, url: ticket.url };
});
```

- Handlers may be registered **before or after** `init` (the queued snippet
  buffers early calls).
- The SDK tells the iframe which handlers exist via `REGISTER_TOOLS` on `READY`
  and whenever the registry changes.
- A tool request for a name with no registered handler returns a typed
  `no_handler` error rather than hanging — the agent is told the tool isn't wired.
- **Mutating** tools are classified **server-side** and gated by an explicit
  confirmation in the iframe; the SDK only ever executes an approved request. The
  SDK performs no client-side mutation classification.

## Mount lifecycle (SPA-safe)

The mounted chat is a **singleton**: a re-`init` (HMR, SPA re-mount, double script
load) reuses the existing element instead of mounting a second one. If the iframe
identity changes (`publicSurfaceId`, `baseUrl`, or `protocolVersion`), the element
rebuilds the iframe/bridge and clears buffered auth before fetching a fresh token.
The element guards `customElements.define`, `window.WpNova`, and the message
listener. Framework wrappers call `destroy()` when disabled or unmounted; direct
SDK users can call `WpNova("destroy")` or `destroy()` to remove the launcher,
iframe, timers, and bridge listener.

## Page snapshot (Visible Page Snapshot)

When the agent needs page context, the iframe asks the SDK for a snapshot. The
SDK captures what the user can **see** — visible structure/text, the current
selection, visible links, visible interactive controls, and form-field labels —
plus a set of **stable element handles** the agent uses to act on the page. It is
captured entirely in the host page and never includes screenshots or raw DOM
replay.

### Field-value policy — default-deny

Field **values** (`input` / `textarea` / `contenteditable`) are **omitted by
default**. A value is captured only when it **opts in** *and* passes every
sensitivity check:

- **Opt-in** — add `data-wp-nova-include` to the field (or any ancestor), or list
  a CSS selector in `safeValueSelectors` on `init`.
- **Hard-excluded regardless of opt-in** — `input[type]` of `password` / `hidden`
  / `file`; `autocomplete` of `cc-*` / `current-password` / `new-password` /
  `one-time-code`; any field whose `name` / `id` / `placeholder` / `aria-label`
  matches `card|cc|cvv|cvc|ssn|secret|token|password|account|iban|routing|pin`.

Field **labels** are always captured (so the agent knows the field exists); only
the value is gated.

### Excluding regions

- `data-wp-nova-ignore` on an element excludes it and its subtree entirely.
- `aria-hidden`, `display:none`, off-viewport, and zero-box subtrees are skipped.

### Scope

Open shadow roots are traversed (composed). Closed shadow roots, cross-origin
iframes, and canvas/WebGL regions can't be read and flip `partial: true` on the
snapshot so the agent knows context is incomplete. Oversized pages are truncated
to a fixed budget (handle count, visible-text chars, per-field value length) and
flip `truncated: true`.

## Navigation

When `pageNavigationEnabled` is on for the surface, the agent can drive the page
through built-in, **non-mutating** navigation actions (the server decides what is
mutating; the iframe gates anything mutating behind confirmation). Each action
targets a handle from the latest snapshot and returns a **fresh** snapshot with
re-issued handles:

| Action | Effect |
| --- | --- |
| `navigate` | Click a captured link/control handle, or assign `args.url`. |
| `open_record` | Click a captured row/link handle to open a record. |
| `set_filter` | Set a search/filter field value (fires `input`/`change`). |
| `scroll_to` | Scroll a handle into view. |
| `highlight` | Scroll to and briefly outline a handle. |

For same-origin URL/link navigation, the SDK first dispatches a cancelable
`wp-nova:navigate` event with `{ url }`. SPA routers can handle the route and
call `preventDefault()`; if they do not, the SDK falls back to normal document
navigation instead of reporting a successful route change against an unchanged
page.

If a handle no longer resolves (SPA re-render), the SDK falls back to the handle's
fingerprint (stable selector → role + accessible name) and, failing that, returns
a typed `stale_handle` error so the agent re-targets against a fresh snapshot
instead of wedging.

## Bridge protocol

All host ↔ iframe communication is `postMessage` with strict `event.origin` +
`event.source` checks; the SDK targets the iframe's exact origin (never `*`).
Request/response pairs carry a `correlationId`; errors are explicit `*_ERROR`
frames (never a successful empty result). See `src/types.ts` for the full,
self-contained wire contract.
