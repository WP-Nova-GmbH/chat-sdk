---
id: quickstart
title: Quickstart
---

This guide takes a fresh app from zero to a working Nova embed. You will create an Embedded Chat Surface, add a backend token endpoint, install the browser SDK, register page-tool handlers, and run the checks that catch most integration mistakes.

## Before You Start

You need:

- A Nova tenant with at least one active user whose email matches the users in your app.
- Access to Nova admin settings to create an Embedded Chat Surface.
- A backend route that can read your authenticated user session.
- The exact browser origins that will load the SDK, for example `https://app.example.com` and `http://127.0.0.1:5173`.

Nova does not auto-provision embedded users. If your backend asserts an email that does not belong to an active Nova tenant user, the SDK shows an unavailable-user state instead of creating a chat session.

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
- Enable page navigation when the agent should use built-in page actions such as opening records, setting filters, scrolling, or highlighting elements.
- Enable Page Tools when your SDK integration should expose `registerTool` definitions to the agent.

## Step 2: Add the Token Endpoint

The SDK never calls Nova directly. It posts to your backend with:

```json
{ "publicSurfaceId": "surf_...", "origin": "https://app.example.com" }
```

Your endpoint must:

1. Authenticate the current user with your own session, cookie, JWT, or server auth.
2. Read the user's email from that authenticated server state. Do not trust an email from the browser body.
3. Call Nova `POST /embed/session` with the integration secret.
4. Return Nova's response body, status, and content type to the SDK.

### Node/Express Example

```ts
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

  let upstream: Response;
  try {
    upstream = await fetch(`${process.env.NOVA_API_URL}/embed/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NOVA_INTEGRATION_SECRET}`,
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
  "message": "We could not find an account for person@example.com."
}
```

The unavailable response is not an error. It is how Nova tells the iframe to render a no-access state without creating a thread. HTTP 4xx/5xx responses and network failures are transport errors; the SDK reports them and retries with bounded backoff.

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

## Step 4: Register Page Tools

Define page tools in the SDK integration. Nova admin only controls whether
SDK-defined page tools are allowed for the surface.

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
    required: ["title"],
  },
  mutating: true,
  confirmationCopy: "Create this ticket?",
  handler: async (args) => {
    const ticket = await crm.createTicket({
      customerId: String(args.customerId ?? ""),
      title: String(args.title ?? "Follow up"),
      priority: String(args.priority ?? "normal"),
    });

    return { ok: true, ticketId: ticket.id, ticketUrl: ticket.url };
  },
});
```

Rules:

- Register tools before or after `init`.
- Use lowercase letters, numbers, and underscores for tool names.
- Mutating tools require `confirmationCopy`.
- Return JSON-serializable data.
- Do not put secrets in handler return values.
- Do not build your own confirmation UI for mutating tools. Nova uses the surface's server-declared `mutating` flag and confirms in the iframe before the SDK executes the handler.
- A missing handler returns a typed `no_handler` error to the agent instead of hanging the conversation.
- Handlers may take an optional second argument, `{ signal }`, an `AbortSignal` the SDK aborts when the bridge times the tool round-trip out, so long-running or mutating handlers can cancel cleanly: `handler: async (args, { signal } = {}) => { ... }`.

## Step 5: Mark DOM Privacy Boundaries

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

Passwords, hidden inputs, file inputs, payment fields, tokens, secrets, account numbers, IBAN/routing fields, PINs, and similar sensitive fields are excluded even if they match an include selector.

## Step 6: Verify

Run these checks in a real browser before shipping:

| Check | Expected result |
| --- | --- |
| Open the page as an authenticated mapped user | Launcher appears and the chat can authenticate. |
| Open the page as an authenticated unmapped user | The iframe shows the unavailable-user message, not a generic transport error. |
| Ask the agent what is visible | It can summarize visible page text but not ignored regions or sensitive field values. |
| Ask the agent to open a visible record or set a visible filter | The page changes and the next response uses a fresh snapshot. |
| Ask the agent to run a mutating page tool | The iframe asks for confirmation before executing the handler. |
| Remove or misspell a handler temporarily | The agent receives a `no_handler` error and explains the tool is not wired. |
| Let the token expire or force a 401 in the iframe | The SDK calls `tokenEndpoint` again and pushes a fresh token. |

For local end-to-end review, Nova's internal test app follows the same pattern:

```bash
cd ~/Dev/chat-sdk
npm --workspace @wp-nova/chat-sdk run build

cd ~/Dev/nova-ark
NOVA_API_URL=http://localhost:8400 \
EMBED_IFRAME_BASE_URL=http://localhost:5173 \
NOVA_INTEGRATION_SECRET="<surface integration secret>" \
EMBED_PUBLIC_SURFACE_ID="<surface public id>" \
EMBED_SDK_DIST_FILE="$HOME/Dev/chat-sdk/packages/chat-sdk/dist/index.global.js" \
npm --workspace @wp-nova/embed-test-site run dev
```

Open `http://127.0.0.1:4308`, add that exact origin to the surface, and repeat the smoke tests.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Chat shows unavailable user | Authenticated email does not match an active Nova tenant user. |
| Token endpoint returns 401 from Nova | Integration secret is missing, wrong, rotated, or the surface is inactive. |
| Nova says origin is not allowed | The exact page origin is missing from the surface allowlist, or the endpoint did not forward `origin`. |
| Agent cannot read the page | `pageReadingEnabled` is off or the page content is hidden/ignored. |
| Agent cannot navigate | `pageNavigationEnabled` is off or the target handle is stale. |
| Tool fails with `no_handler` | The handler registered with `registerTool` was removed or the requested tool name no longer matches an SDK-defined tool. |
| Tool never executes | The user declined the mutating-tool confirmation. |
| Snapshot omits a field value | The field was not opted in or matched a sensitivity rule. |
| Launcher never appears at all | The SDK script failed to load. In devtools Network, confirm the script tag returns 200, not 404. A 404 on `https://chat.wp-nova.ai/sdk/<version>/sdk.js` means that version is not deployed; verify the exact `<version>` and that `integrity` matches the published `.sri`. For local development, self-host the released `dist/index.global.js` from your own origin. |
| Launcher never authenticates | `tokenEndpoint` is unreachable, returns malformed JSON, or does not pass through Nova's response. |
