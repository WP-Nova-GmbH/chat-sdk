---
id: quickstart
title: Quickstart
---

Create a surface, add a secure token endpoint, mount the SDK, then enable only the page capabilities you need.

Before coding, complete [Plan your integration](./planning.md). In particular,
decide whether the host uses cookie or bearer authentication, which roles get
chat/tools/routes, whether navigation loads data asynchronously, and what
content the agent must never see.

## Before You Start

You need:

- A Nova tenant with at least one active user whose email matches the users in your app.
- Access to Nova admin settings to create an Embedded Chat Surface.
- A backend route that can read your authenticated user session.
- The exact browser origins that will load the SDK, for example `https://app.example.com` and `http://127.0.0.1:5173`.

Nova does not auto-provision embedded users; unmatched emails receive an unavailable-user state.

## Step 1: Create a Surface

In Nova admin, open **Settings > Embedded Surfaces** and create a surface.

Record these values:

| Value | Where it goes | Secret? |
| --- | --- | --- |
| Integration secret | Backend environment variable only | Yes |
| Public surface id, such as `surf_...` | Browser SDK config | No |
| Allowed origins | Surface configuration | No |

Configure the surface:

- Add every production, staging, and local origin that may load the SDK. Origins are exact: scheme, host, and port must match.
- Use production origin mode for deployed apps. Development mode is only for temporary local or staging review.
- Enable page reading when the agent should understand the visible page.
- Enable page navigation when the agent should use built-in page actions such as navigating, opening/clicking records, setting filters, scrolling, or refreshing context. Page navigation requires page reading.
- Enable Page Tools when your SDK integration should expose `registerTool` definitions to the agent.

## Step 2: Add the Token Endpoint

The SDK never calls Nova directly. It posts to your backend with:

```json
{ "publicSurfaceId": "surf_...", "origin": "https://app.example.com" }
```

Your endpoint must:

1. Authenticate the current user with your own session, cookie, JWT, or server auth.
2. Read the user's email from that authenticated server state. Do not trust an email from the browser body.
3. Validate the requested public surface id and both the body/header origin against the host app's configured values.
4. Call Nova `POST /embed/session` with the integration secret and a bounded timeout.
5. Return Nova's response body, status, and content type to the SDK.

The SDK sends cookies with `credentials: "include"`, but it does not inherit
an application's custom bearer header. If your SPA is bearer-authenticated,
first call a protected bootstrap endpoint from the app to create a short-lived,
opaque `HttpOnly` server session for the token endpoint. Revoke that session
on logout. See [Select the authentication pattern](./planning.md#select-the-authentication-pattern).

### Node/Express Example

```ts
function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const novaApiUrl = requireEnv("NOVA_API_URL");
const novaIntegrationSecret = requireEnv("NOVA_INTEGRATION_SECRET");
const expectedSurfaceId = requireEnv("NOVA_PUBLIC_SURFACE_ID");
const expectedOrigin = new URL(requireEnv("WEB_APP_URL")).origin;

app.post("/api/nova-token", async (req, res) => {
  const user = await requireUser(req);
  if (!user?.email) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const publicSurfaceId =
    typeof req.body.publicSurfaceId === "string" ? req.body.publicSurfaceId.trim() : "";
  const origin = typeof req.body.origin === "string" ? req.body.origin.trim() : "";

  if (!publicSurfaceId || !origin) {
    return res.status(400).json({ error: "publicSurfaceId and origin are required" });
  }

  if (
    publicSurfaceId !== expectedSurfaceId ||
    origin !== expectedOrigin ||
    req.get("origin") !== expectedOrigin
  ) {
    return res.status(400).json({ error: "Unexpected Nova surface or host origin" });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${novaApiUrl}/embed/session`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${novaIntegrationSecret}`,
        Origin: origin,
      },
      body: JSON.stringify({
        email: user.email,
        publicSurfaceId,
        origin,
        externalUserId: user.id,
      }),
    });
  } catch (error) {
    return res.status(502).json({
      error: "Could not reach Nova POST /embed/session",
    });
  }

  const text = await upstream.text();
  res
    .status(upstream.status)
    .type(upstream.headers.get("content-type") || "application/json")
    .set("Cache-Control", "no-store")
    .send(text);
});
```

Use server-only environment variables:

```bash
NOVA_API_URL=https://chat.wp-nova.ai/api
NOVA_INTEGRATION_SECRET=<surface integration secret>
NOVA_PUBLIC_SURFACE_ID=surf_...
WEB_APP_URL=https://app.example.com
```

If your deployment uses a different Nova API origin, use the API URL shown by your Nova admin environment. The browser app should never receive `NOVA_INTEGRATION_SECRET`.

### Token Responses

Pass both successful outcomes through unchanged:

```json
{
  "access_token": "<embedded-session token>",
  "expires_in": 900,
  "displaySettings": {
    "title": "Support",
    "accent": "#0066CC"
  }
}
```

```json
{
  "unavailable": true,
  "email": "person@example.com",
  "message": "We could not find an account for person@example.com.",
  "message_is_custom": false,
  "access_request_token": "<purpose-scoped capability>",
  "access_request_expires_in": 3600
}
```

Pass the complete unavailable response through unchanged. Nova localizes built-in
copy when `message_is_custom` is `false` and preserves administrator copy when it
is `true`; other HTTP errors remain transport failures.

## Step 3: Install the Browser SDK

Choose the script tag when you want the smallest integration surface. Choose npm when the host app is already bundled.

### Script Tag

The queued snippet lets you register tools before the SDK file has loaded. Calls are replayed in order when the global bundle installs the real dispatcher.

```html
<script>
  (function (w, d, s) {
    w.WpNova = w.WpNova || function () {
      (w.WpNova.q = w.WpNova.q || []).push(arguments);
    };
    var j = d.createElement(s);
    j.async = 1;
    j.src = "https://chat.wp-nova.ai/sdk/<version>/sdk.js";
    j.crossOrigin = "anonymous";
    j.integrity = "sha384-<published hash for this version>";
    d.head.appendChild(j);
  })(window, document, "script");

  WpNova("init", {
    publicSurfaceId: "surf_...",
    tokenEndpoint: "/api/nova-token"
  });
</script>
```

Use the immutable, version-pinned URL with Subresource Integrity for production. Copy the exact version and SRI value from the Nova admin install guide or package release metadata. The rolling `https://chat.wp-nova.ai/sdk/v1/sdk.js` channel exists for convenience, but its bytes change over time and cannot use SRI.

### npm

```bash
npm install @wp-nova/chat-sdk
```

```ts
import { init } from "@wp-nova/chat-sdk";

init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
});
```

For framework wrappers, see [React](./react.md) and [Angular](./angular.md).

## Step 4 (Optional): Register Page Tools

Define page tools in the SDK integration. Nova admin only controls whether
SDK-defined page tools are allowed for the surface. Skip this step when the
assistant only needs page reading or built-in navigation.

```ts
import { registerTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "create_ticket",
  description: "Creates a support ticket from the current customer context.",
  inputSchema: {
    type: "object",
    properties: {
      customerId: { type: "string" },
      title: { type: "string" },
      priority: { type: "string", enum: ["low", "normal", "high"] },
    },
    required: ["customerId", "title"],
  },
  mutating: true,
  confirmationCopy: "Create this ticket?",
  handler: async (args) => {
    const customerId = String(args.customerId ?? "").trim();
    if (!customerId) {
      return { ok: false, code: "validation_error", message: "customerId is required" };
    }

    const ticket = await crm.createTicket({
      customerId,
      title: String(args.title ?? "Follow up"),
      priority: String(args.priority ?? "normal"),
    });

    return { ok: true, ticketId: ticket.id, ticketUrl: ticket.url };
  },
});
```

- Register complete definitions with lowercase names and JSON-serializable, secret-free results.
- Mark mutations explicitly; Nova confirms them once in the iframe. Honor the optional handler `AbortSignal`.
- Register only permitted tools. Use a read-only lookup to ground live choices before a mutation.

See [Tools and guided workflows](./tools.md) for limits, errors, idempotency, and lookup/mutation patterns.

## Step 5: Declare Routes and Connect Navigation

Pass a permission-filtered route manifest when the agent should reach pages that
are not visible in the current snapshot:

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  routes: [
    { path: "/customers", description: "Customer lookup list with search" },
    {
      path: "/customers/:customerId",
      description: "Customer detail; obtain customerId from /customers",
    },
  ],
});
```

For an SPA, handle `wp-nova:navigate` with the app router. If a destination
loads data after route commit, configure:

```ts
settle: {
  quietMs: 1000,
  maxWaitMs: 5000,
  waitForNavigationSignal: true,
}
```

Then dispatch `wp-nova:settled` only after the exact destination and its
required data have rendered. See [Navigation and async pages](./navigation.md).

## Step 6: Mark DOM Privacy Boundaries

The SDK captures visible page structure, not screenshots or raw HTML. Field values are default-deny.

Use `data-wp-nova-include` only for values the agent may read:

```html
<input id="case-number" data-wp-nova-include value="CASE-2026-0142" />
```

Or configure selectors:

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  safeValueSelectors: ["#case-number", ".agent-safe-field"],
});
```

Exclude sensitive regions entirely:

```html
<section data-wp-nova-ignore>
  Internal notes and secrets never sent to Nova.
</section>
```

Sensitivity rules still exclude passwords, payment data, tokens, account details, and similar values. See [Giving the agent DOM access](./dom-access.md).

## Step 7: Verify

Run these checks in a real browser before shipping:

| Check | Expected result |
| --- | --- |
| Open the page as an authenticated mapped user | Launcher appears and the chat can authenticate. |
| Open the page as an authenticated unmapped user | The iframe shows the unavailable-user message, not a generic transport error. |
| Ask the agent what is visible | It can summarize visible page text but not ignored regions or sensitive field values. |
| Ask the agent to open a visible record or set a visible filter | The page changes and the next response uses a fresh snapshot. |
| Ask the agent to open a declared async route | The post-navigation snapshot contains the loaded destination data, not the old screen or only a new URL. |
| Ask the agent to run a mutating page tool | The iframe asks for confirmation before executing the handler. |
| Sign in as a role without a tool/route | The capability is absent and the underlying API remains forbidden. |
| Remove or misspell a handler temporarily | The agent receives a `no_handler` error and explains the tool is not wired. |
| Let the token expire or force a 401 in the iframe | The SDK calls `tokenEndpoint` again and pushes a fresh token. |

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Nova says origin is not allowed | The exact page origin is missing from the surface allowlist, or the endpoint did not forward `origin`. |
| Bearer SPA receives 401 from `tokenEndpoint` | Bootstrap the trusted `HttpOnly` session first; the SDK does not send the app bearer header. |
| URL changes but agent sees the previous page | The SPA accepted navigation before async data rendered. Use `waitForNavigationSignal` and send `wp-nova:settled` after the destination is ready. |
| Tool registration throws | Check the lowercase name, reserved built-ins, 20+ character description, object JSON Schema, explicit `mutating`, and confirmation copy. |
| Launcher never appears at all | The SDK script failed to load. In devtools Network, confirm the script tag returns 200, not 404. A 404 on `https://chat.wp-nova.ai/sdk/<version>/sdk.js` means that version is not deployed; verify the exact `<version>` and that `integrity` matches the published `.sri`. For local development, self-host the released `dist/index.global.js` from your own origin. |
