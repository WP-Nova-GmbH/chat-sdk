---
id: planning
title: Plan your integration
---

A reliable integration starts with product, security, and navigation decisions. Record them before coding.

## Integration worksheet

| Decision | Questions to answer | Where it is implemented |
| --- | --- | --- |
| Users and scope | Which users, roles, tenants, modules, routes, and environments get chat? | Surface membership, SDK `enabled` state, and conditional tool/route registration. |
| Host authentication | Does the app use a same-origin cookie session or a browser-held bearer token? Where does the backend get the trusted email? | Customer backend token endpoint; bearer apps may need a cookie bootstrap. |
| Origins | Which exact production, staging, and local origins load the SDK? | Surface `allowedOrigins` and backend origin validation. |
| Page reading | Should the agent see the current page? Which values are safe, and which regions must be excluded? | Surface Page Reading, `data-wp-nova-include`, `safeValueSelectors`, and `data-wp-nova-ignore`. |
| Built-in page control | Should the agent navigate, open records, click controls, set filters, or scroll? | Surface Page Navigation, route manifest, semantic DOM controls, and SPA navigation adapter. Page Navigation depends on Page Reading. |
| Custom tools | Which app APIs or workflows deserve dedicated read-only or mutating tools? | Surface Page Tools gate plus SDK `registerTool` definitions and handlers. |
| Guided choices | Which workflows require the agent to choose from customers, suppliers, categories, or other live options? | Read-only lookup tools that return bounded choices; Nova renders `request_user_input` in the iframe. |
| Site routes | Should the agent know routes that are not visible on the current page? Which roles can reach each route, and where do parameter ids come from? | `SdkConfig.routes`, filtered for the signed-in user. |
| SPA readiness | Does navigation wait for loaders, queries, lazy chunks, or transitions? What proves the destination is ready? | `wp-nova:navigate`, `settle.waitForNavigationSignal`, and `wp-nova:settled`. |
| Appearance | What are the visible title, primary/accent color, launcher and icon colors, logo, host light/dark source, and any per-mode launcher colors? | Surface display settings plus browser-safe `theme`, first-paint colors, and live host-theme synchronization. |
| Voice | Should the embed expose voice, and does the host Permissions Policy allow the iframe microphone? | `voiceMode` and `Permissions-Policy`. |
| Mount lifecycle | Where is the persistent app shell? When should chat be disabled or destroyed? | Root provider/component; do not remount on ordinary SPA route changes. |
| Verification | Which mapped and unmapped users, roles, routes, tools, and sensitive pages cover the real risk? | Automated tests and the browser smoke matrix. |

## Choose capabilities independently

| Capability | What it provides | Required surface setting |
| --- | --- | --- |
| Visible Page Snapshot | Visible text, links, controls, safe values, and current route context. | Page Reading |
| Built-in page control | Same-origin navigation, opening/clicking visible controls, filters, scrolling, and context refresh. | Page Reading + Page Navigation |
| SDK-defined page tools | Purpose-built host-app API calls such as `list_customers` or `create_ticket`. | Page Tools |

SDK tools are declared in the host integration; Page Tools is the surface-level kill switch. Enable only the capabilities the product needs.

## Select the authentication pattern

The SDK calls `tokenEndpoint` with `credentials: "include"`; it neither inherits a host bearer token nor receives the Nova integration secret.

### Cookie-authenticated host app

Authenticate `tokenEndpoint` with the existing same-origin session, read the trusted email, and proxy Nova `POST /embed/session`. See the [Quickstart](./quickstart.md).

### Bearer-authenticated SPA

For bearer-authenticated apps, create a short-lived server session bridge:

1. The app calls a protected bootstrap endpoint with its existing bearer token.
2. The backend reads the trusted user, stores only the minimum identity needed for Nova, and sets an opaque `HttpOnly` cookie.
3. The SDK calls the same-origin `tokenEndpoint`; the backend resolves the opaque cookie and calls Nova with the server-only integration secret.
4. Logout revokes the bridge session and clears the cookie.

Use a random session id, shared storage for multiple replicas, bounded expiry, `Cache-Control: no-store`, and an `HttpOnly` cookie with a narrow path, appropriate `SameSite`, and `Secure` on HTTPS. For either pattern, validate the configured surface id plus body and header origins. Never trust browser identity or proxy arbitrary surfaces/origins.

## Decide what belongs in routes, the DOM, or a tool

- Declare a **route** when the agent should know that a page exists and can reach it directly.
- Expose a semantic **link or button** when the user can already perform the action in the visible UI.
- Add a read-only **tool** for authoritative search, lookup, validation, pagination, or data hidden behind virtualization.
- Add a mutating **tool** for a validated domain workflow that should run through the app's normal services and permission checks.

Container-only click handlers may not appear in snapshots; expose real labeled links or buttons.

For a mutation with live choices, pair tools:

1. A read-only lookup returns current stable ids, labels, dependent values, and truncation state.
2. Nova uses `request_user_input` when multiple grounded candidates remain.
3. The mutation accepts stable values, validates again, uses iframe confirmation, and returns a stable URL.

See [Tools and guided workflows](./tools.md) for concrete contracts.

## Final design checks

- Build routes from router constants, filter them with UI permissions, and treat them as context rather than authorization. See [Navigation](./navigation.md).
- Review sensitive page families—not only one screen—and ignore whole private subtrees. Opt in only required safe values.
- Set the product's real primary/accent, icon contrast, host `theme`, and any
  per-mode launcher colors for first paint. Keep `theme` synchronized with the
  host application; authenticated surface settings remain authoritative. See
  [Theming](./theming.md).

## Definition of done

An integration is ready when:

- mapped/unmapped users, exact origins, and server-only secrets behave correctly;
- chat persists across routes, is revoked on logout, and matches the host product;
- routes and tools follow permissions, while backend authorization remains enforced;
- async navigation returns loaded content rather than a stale snapshot;
- lookups ground choices, mutations confirm once, and failures are structured;
- privacy tests, type checks, automated tests, build, and browser smoke checks pass.
