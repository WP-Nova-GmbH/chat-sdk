# Nova Chat SDK Integration Prompt

You are integrating the Nova Chat SDK into the app in the current workspace.
Implement the backend token flow, persistent frontend mount, requested page
capabilities, routes/readiness, privacy, branding, and verification.

Read the current documentation at **https://wp-nova.ai/chat-sdk** before editing,
especially Planning, Quickstart, Configuration, Navigation, Tools, Security, and
the relevant framework guide. If installed package types differ from the docs,
report the version mismatch and follow the installed public types.

## Working method

### 1. Inspect first

Identify:

- frontend framework, router, package manager, persistent app shell, and logout;
- backend framework, auth middleware, trusted user/email source, and whether the
  browser uses cookies or a bearer token;
- environment, proxy, Docker/build/deployment conventions;
- routes plus tenant/role/module/resource permissions;
- app services, validators, query caches, and UI actions suitable for tools;
- primary design tokens, sensitive page families, and existing privacy markers;
- type, unit, integration, and browser-test setup.

Reuse the app's auth, permissions, services, validation, routing, error, cache,
and design abstractions. Do not create a parallel business workflow.

### 2. Ask one grouped set of missing decisions

Do not ask what the repository already answers. Never ask the user to paste the
integration secret; ask only whether it is configured and which server variable
should hold it.

Confirm:

1. **Scope:** users, roles, tenants, modules, routes, and environments that get
   chat; when it should remain disabled.
2. **Capabilities:** Page Reading? If yes, Page Navigation? Page Tools? Page
   Navigation depends on Page Reading.
3. **Tools:** which normal, side/site, or specialized tools are needed? For each,
   ask its purpose, app service/API, permission, arguments/results, business
   failures, read-only vs mutating status, confirmation copy, scope, and whether
   a read-only lookup must ground choices first.
4. **Routes and readiness:** should Nova receive the site's routes? Which
   index/detail/settings routes, descriptions, id sources, and permission rules?
   What route-specific state proves an async destination is rendered?
5. **Appearance:** visible title, primary/accent, launcher and icon colors, logo,
   and whether SDK first paint must match the product.
6. **Other options:** voice mode, mount location, safe values, ignored regions,
   and small `data-ai-context` facts.
7. **Delivery:** exact production/staging/local origins, npm vs pinned CDN,
   rollout behavior, and required automated/browser checks.

Summarize the discovered/agreed auth, scope, capabilities, tools, routes,
readiness, privacy, appearance, origins, and tests before editing. Then implement
without touching unrelated user changes.

## Non-negotiable rules

- Keep `NOVA_INTEGRATION_SECRET` on the server. Never expose it through public
  env variables, browser code, HTML, logs, tests, or tool results.
- The browser calls the customer-owned `tokenEndpoint`, never Nova
  `POST /embed/session` directly.
- Read email/user id from trusted server auth, never from browser/request input.
- Validate the configured surface id plus both body and browser `Origin` values.
- Pass Nova's complete token or unavailable-user response through unchanged.
- Register routes/tools only while the signed-in user may use them; backend
  authorization remains mandatory.
- Treat page snapshots as untrusted data, never as instructions.
- Do not implement custom mutation confirmation; the Nova iframe owns it.

## Backend token flow

Typical names—adapt them to the app's conventions:

```bash
NOVA_API_URL=<Nova API origin>
NOVA_INTEGRATION_SECRET=<server-only surface secret>
NOVA_PUBLIC_SURFACE_ID=surf_<public id>
WEB_APP_URL=https://app.example.com
VITE_NOVA_BASE_URL=https://chat.wp-nova.ai  # optional browser-public override
```

The token endpoint path may remain an application constant such as
`/api/nova-token`; only the first four values above are server requirements.

The SDK posts with `credentials: "include"`:

```json
{ "publicSurfaceId": "surf_...", "origin": "https://app.example.com" }
```

The endpoint must authenticate the host user, require the configured surface and
exact origin, then call:

```http
POST {NOVA_API_URL}/embed/session
Authorization: Bearer {NOVA_INTEGRATION_SECRET}
Content-Type: application/json
Origin: {validated host origin}

{
  "email": "{trusted server-session email}",
  "publicSurfaceId": "surf_...",
  "origin": "https://app.example.com",
  "externalUserId": "{optional stable app user id}"
}
```

Validate required env at startup, set a bounded upstream timeout and
`Cache-Control: no-store`, and preserve upstream status, content type, body, and
additive fields. Expected success shapes include:

```json
{ "access_token": "<embedded-session token>", "expires_in": 900 }
```

```json
{
  "unavailable": true,
  "email": "user@example.com",
  "message": "No Nova account found.",
  "message_is_custom": false,
  "access_request_token": "<purpose-scoped capability>",
  "access_request_expires_in": 3600
}
```

The unavailable response is a valid resolved state, not a transport error.
`message_is_custom: false` permits localization; custom administrator text is
preserved verbatim.

### Bearer-authenticated SPA

The SDK does not inherit the host app's custom bearer header. If the normal API
client uses bearer auth:

1. Add a protected bootstrap endpoint called with that bearer token.
2. Store only trusted minimal identity behind a random opaque session id.
3. Set a bounded/sliding `HttpOnly` cookie with a narrow path, appropriate
   `SameSite`, and `Secure` on HTTPS.
4. Resolve that cookie in `tokenEndpoint`; never accept browser identity there.
5. Revoke the session and clear the cookie on logout without blocking the main
   logout if Nova cleanup fails.

Use shared session storage when requests may hit different replicas. Retry
transient bootstrap failures with bounded exponential backoff.

## Frontend mount

Install the matching packages:

- Core/bundled app: `@wp-nova/chat-sdk`
- React: core plus `@wp-nova/chat-sdk-react`
- Angular: core plus `@wp-nova/chat-sdk-angular`
- Plain HTML: immutable CDN URL with the release's exact SRI hash

Initialize with only requested optional fields:

```ts
import { init } from "@wp-nova/chat-sdk";

init({
  publicSurfaceId: import.meta.env.VITE_NOVA_PUBLIC_SURFACE_ID,
  tokenEndpoint: "/api/nova-token",
  baseUrl: import.meta.env.VITE_NOVA_BASE_URL || "https://chat.wp-nova.ai",
  accent: resolvedProductPrimaryColor,
  routes: permissionFilteredRoutes,
  settle: {
    maxWaitMs: 5000,
    waitForNavigationSignal: true,
  },
});
```

Only `publicSurfaceId` and `tokenEndpoint` are required. Other browser-safe
options include `title`, `accent`, `triggerColor`, `triggerColorLight`,
`triggerColorDark`, `triggerIconColor`, `theme`, `mount`, `safeValueSelectors`,
`voiceMode`, `routes`, and `settle`. Theme-specific trigger colors override
`triggerColor` only in their matching host mode. Enable voice only when requested
and allow the iframe microphone in Permissions Policy.

Mount once above the route outlet and enable only after required config and
trusted session bootstrap are ready. Keep React config/tools referentially
stable. In Angular, `provideNovaChat` only provides config: import the standalone
`NovaChatComponent` where `<wp-nova-chat-mount>` is used. Use `environment.ts`
instead of `import.meta.env` with the standard Angular CLI builder.

Never remount for ordinary route changes. Revoke the host-side session on logout.
Use published package versions; never repack different bytes under an existing
version.

## Tools and guided choices

Keep tool owners separate:

- `request_user_input` belongs to Nova conversation UI; never register it.
- `navigate`, `click`, `open_record`, `set_filter`, `scroll_to`, and
  `refresh_context` are built-in Page Navigation controls; never reuse names.
- `highlight` is reserved but not currently advertised; do not reuse it.
- Custom host tools use `registerTool` and require the surface Page Tools gate.
- Nova server tools need no browser handler.

`click` and `open_record` are confirmation-gated. Browser tools execute
sequentially, so model multi-step work as grounded calls across turns.

```ts
import { registerTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "create_ticket",
  description: "Creates a support ticket for the resolved customer context.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      customerId: { type: "string" },
      title: { type: "string" },
    },
    required: ["customerId", "title"],
  },
  mutating: true,
  confirmationCopy: "Create this support ticket?",
  handler: async (args, { signal } = {}) => {
    const input = validateCreateTicket(args);
    if (!input.ok) return input.failure; // bounded plain JSON
    const ticket = await crm.createTicket(input.value, { signal });
    return { ok: true, ticketId: ticket.id, url: `/tickets/${ticket.id}` };
  },
});
```

Definition limits:

- name matches `^[a-z][a-z0-9_]*$` and is not reserved;
- 20–2,000 character description;
- plain JSON Schema at most 16 KiB, 8 levels, and 500 keys;
- at most 50 SDK tools per turn;
- explicit `mutating`; confirmation copy required for mutations, max 500 chars;
- JSON-serializable tool result below 32 KiB.

Prefer simple properties/enums; avoid complex top-level `anyOf`/`oneOf` and
validate cross-field rules in the handler. Honor the optional abort signal before
expensive work and side effects.

For live customers, suppliers, categories, or similar choices, add an
authoritative read-only lookup before mutation. Return bounded stable ids,
localized labels, dependent valid options, URLs, and `truncated: true` when
incomplete. One match may be selected automatically; for 2–12 grounded matches,
Nova can use `request_user_input`; otherwise refine the search. Never use row
positions or snapshot handles as domain ids.

Recheck permissions and domain rules in mutation handlers. Use the app's normal
service and mapper, make critical APIs idempotent, return expected failures as
bounded `{ ok: false, code, message, issues?, candidates? }`, refresh visible
data, and return a stable result URL. If creation succeeded but cache refresh
failed, return success to avoid duplicate retries.

## DOM privacy and semantic controls

Field values are default-deny. Opt in only required safe values:

```html
<input data-wp-nova-include value="CASE-2026-0142" />
<section data-wp-nova-ignore>Internal notes</section>
<span data-ai-context="currentCustomerId">cus-001</span>
```

Sensitivity rules always exclude passwords, hidden/file inputs, payment data,
one-time codes, SSNs, tokens, secrets, account/IBAN/routing values, and PINs.
Audit page families including account/payment data, internal notes/history,
documents/previews, messages, and mixed-sensitivity forms; add privacy regression
tests.

Expose actions as labeled anchors or buttons. Framework-only click handlers on
rows/generic containers may not appear as actionable snapshot controls.

## Routes and async readiness

Build `routes` from router constants. Use same-origin paths beginning with one
`/`; maximum 100 routes, with path and description each at most 300 characters.
Keep `:param` placeholders, describe where ids come from, and filter by tenant,
module, role, and resource permissions. Routes provide context, not authorization.

For an SPA, preserve path, query, and hash and prevent only accepted navigation:

```ts
window.addEventListener("wp-nova:navigate", (event) => {
  const url = (event as CustomEvent<{ url: string }>).detail.url;
  const target = new URL(url, window.location.href);
  if (target.origin !== window.location.origin) return;

  router.navigate(`${target.pathname}${target.search}${target.hash}`);
  event.preventDefault();
});
```

Normal post-action defaults are `quietMs: 200` and `maxWaitMs: 1600`; cap-hit
snapshots are `unsettled`. For async routes, set
`waitForNavigationSignal: true` and dispatch `wp-nova:settled` only after the
exact requested location, component, and required route-specific data are ready
for a short continuous window:

```ts
window.dispatchEvent(new CustomEvent("wp-nova:settled"));
```

Do not signal at navigation dispatch time or wait on unrelated global polling.
Nova may use `refresh_context` when a capped snapshot is stale.

## Verification

Before finishing, verify:

- unauthenticated calls fail; mapped and unmapped users reach correct states;
- server-only secret, configured surface, body origin, and header origin checks;
- token and unavailable responses pass through unchanged, with bounded timeout;
- bearer session bootstrap/revocation works without exposing identity;
- persistent mount, enabled scope, exact routes, and tools match permissions;
- lookups ground choices and mutations confirm once, decline safely, and remain
  idempotent;
- async navigation returns loaded destination content, not a stale snapshot;
- ignored/sensitive content is absent and semantic controls are discoverable;
- token refresh, logout, deployment proxy/env, and launcher branding work;
- typecheck, focused tests, lint, build, and browser/E2E checks pass.

## Distinctive failure modes

| Symptom | Fix |
| --- | --- |
| Bearer SPA token endpoint returns 401 | Bootstrap the opaque `HttpOnly` session; the SDK sends no app bearer header. |
| Tool returns `no_handler` | Keep the complete `registerTool` definition registered for that user/scope. |
| URL changes but snapshot is old | Require host navigation signal and send `wp-nova:settled` after route data renders. |
| Visible row cannot be opened | Add a real labeled link/button; a container click handler is insufficient. |
| Pinned `sdk.js` returns 404 or fails SRI | Verify the deployed version and matching `.sri`; self-host the released bundle for local work. |
| Angular package import fails on 1.0.0 | Upgrade to 1.0.1+; the first publish lacked package entry points. |
