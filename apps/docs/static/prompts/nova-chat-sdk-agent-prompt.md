# Nova Chat SDK Integration Prompt

You are a coding agent integrating the Nova Chat SDK into the website or app in the current workspace. Implement the integration end to end, including the backend token endpoint, frontend SDK mount, page-tool handlers, DOM privacy annotations, and verification.

## Non-Negotiable Security Rules

- Never put the Nova integration secret in browser code, public env vars, static HTML, logs, or tests.
- Never call Nova `POST /embed/session` directly from the browser.
- Read the user's email from the authenticated server-side session. Do not trust an email or user id supplied by the browser.
- Pass through both successful Nova token outcomes: `{ access_token, expires_in }` and `{ unavailable: true, email, message }`.
- Browser tool registration does not grant the agent new tools: the surface must allow SDK-defined page tools (an allow-list gate on the Nova Embedded Chat Surface). The tool name, description, schema, mutating flag, and handler live in your browser integration code, not in Nova admin.
- Do not build custom confirmation UI for mutating tools. The iframe confirms mutating tools using the server-declared `mutating` flag.

## Inputs to Collect

Ask for or locate these values before coding:

```bash
NOVA_API_URL=<Nova API origin that serves POST /embed/session>
NOVA_INTEGRATION_SECRET=<surface integration secret, server-only>
NOVA_PUBLIC_SURFACE_ID=surf_<public surface id>
NOVA_TOKEN_ENDPOINT=/api/nova-token
NOVA_IFRAME_BASE_URL=https://chat.wp-nova.ai
```

For production, confirm the Embedded Chat Surface allows the exact host origin, for example `https://app.example.com`. For local testing, the exact loopback origin and port must be present, for example `http://127.0.0.1:5173`.

## Implementation Checklist

1. Detect the app framework and package manager.
2. Add a backend `POST` endpoint for `NOVA_TOKEN_ENDPOINT`.
3. Store `NOVA_INTEGRATION_SECRET` only in server-side env/config.
4. Install the right frontend package:
   - Plain HTML or non-bundled page: CDN script snippet.
   - React: `@wp-nova/chat-sdk` and `@wp-nova/chat-sdk-react`.
   - Angular: `@wp-nova/chat-sdk` and `@wp-nova/chat-sdk-angular`.
   - Other bundled app: `@wp-nova/chat-sdk`.
5. Initialize with `publicSurfaceId` and `tokenEndpoint`.
6. Register handlers for useful surface-declared page tools.
7. Add `data-wp-nova-include` only to safe fields and `data-wp-nova-ignore` to sensitive regions.
8. Add tests or a manual smoke path that proves auth, unavailable user, page reading, tool execution, and sensitive-field exclusion.

## Backend Token Endpoint

The SDK posts:

```json
{ "publicSurfaceId": "surf_...", "origin": "https://app.example.com" }
```

Your endpoint must authenticate the current user and call Nova:

```http
POST {NOVA_API_URL}/embed/session
Authorization: Bearer {NOVA_INTEGRATION_SECRET}
Content-Type: application/json
Origin: {origin from SDK request}

{
  "email": "{email from server session}",
  "publicSurfaceId": "{publicSurfaceId from SDK request}",
  "origin": "{origin from SDK request}",
  "externalUserId": "{optional stable app user id}"
}
```

### Express-Style Template

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
  } catch {
    return res.status(502).json({ error: "Could not reach Nova POST /embed/session" });
  }

  const text = await upstream.text();
  res
    .status(upstream.status)
    .type(upstream.headers.get("content-type") || "application/json")
    .set("Cache-Control", "no-store")
    .send(text);
});
```

### Response Shapes to Pass Through

```json
{ "access_token": "<embedded-session token>", "expires_in": 900 }
```

```json
{ "unavailable": true, "email": "user@example.com", "message": "No Nova account found." }
```

The unavailable response is a valid success state. Do not turn it into `401`, `403`, or `404`.

## Frontend Mount

### Vanilla or Script Tag

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

### Core npm

```ts
import { init, registerTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "create_ticket",
  description: "Create a support ticket for the visible customer context.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      priority: { type: "string", enum: ["low", "normal", "high"] }
    },
    required: ["title"]
  },
  mutating: true,
  confirmationCopy: "Create this ticket?",
  handler: async (args) => {
    const ticket = await crm.createTicket(args);
    return { ok: true, ticketId: ticket.id, ticketUrl: ticket.url };
  }
});

init({
  publicSurfaceId: import.meta.env.VITE_NOVA_PUBLIC_SURFACE_ID,
  tokenEndpoint: "/api/nova-token",
  baseUrl: import.meta.env.VITE_NOVA_BASE_URL || "https://chat.wp-nova.ai",
});
```

Only `publicSurfaceId` and `tokenEndpoint` are required. Optional browser-safe
config fields include `title`, `accent`, `triggerColor`, `triggerIconColor`,
`mount`, `safeValueSelectors`, and `voiceMode` (set `voiceMode: true` to enable
the embedded voice button and delegate microphone access to the Nova iframe;
defaults to `false`).

### React

```tsx
import { NovaChatProvider, type NovaToolDefinition } from "@wp-nova/chat-sdk-react";

const tools: NovaToolDefinition[] = [
  {
    name: "create_ticket",
    description: "Create a support ticket for the visible customer context.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" }
      },
      required: ["title"]
    },
    mutating: true,
    confirmationCopy: "Create this ticket?",
    handler: async (args) => {
      return crm.createTicket({
      title: String(args.title ?? "Follow up"),
    });
    }
  }
];

export function App() {
  return (
    <NovaChatProvider
      config={{
        publicSurfaceId: import.meta.env.VITE_NOVA_PUBLIC_SURFACE_ID,
        tokenEndpoint: "/api/nova-token",
        baseUrl: import.meta.env.VITE_NOVA_BASE_URL,
      }}
      tools={tools}
    >
      <Routes />
    </NovaChatProvider>
  );
}
```

### Angular

```ts
import { provideNovaChat } from "@wp-nova/chat-sdk-angular";

export const appConfig = {
  providers: [
    provideNovaChat({
      publicSurfaceId: import.meta.env["VITE_NOVA_PUBLIC_SURFACE_ID"],
      tokenEndpoint: "/api/nova-token",
      baseUrl: import.meta.env["VITE_NOVA_BASE_URL"],
    }),
  ],
};
```

`provideNovaChat` only registers config. `NovaChatComponent` is a standalone
component, so import it into the consuming component's `imports` or the
`<wp-nova-chat-mount>` element will not instantiate:

```ts
import { NovaChatComponent } from "@wp-nova/chat-sdk-angular";

@Component({
  standalone: true,
  selector: "app-root",
  imports: [NovaChatComponent],
  template: `<wp-nova-chat-mount [tools]="tools" />`,
})
export class AppComponent {
  tools = [/* ToolDefinition[] */];
}
```

`import.meta.env["VITE_*"]` assumes a Vite-based Angular build; with the Angular
CLI builder, read the same values from an `environment.ts` file instead.

## Page Tools

Page tools are defined in the customer SDK integration with `registerTool`.
Nova admin controls whether SDK-defined tools are allowed for a surface; the
tool name, description, schema, mutating flag, confirmation copy, and handler
live together in browser integration code.

Tool definition shape:

```ts
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutating: boolean;
  confirmationCopy?: string;
  handler: (
    args: Record<string, unknown>,
    opts?: { signal?: AbortSignal },
  ) => unknown | Promise<unknown>;
}
```

The handler's optional `opts.signal` is an `AbortSignal` the SDK aborts when the
bridge times the tool round-trip out, so a long-running or mutating handler can
cancel in-flight work. The one-argument form is fine when you do not need it.

Example SDK declaration:

```ts
registerTool({
  name: "create_ticket",
  description: "Create a support ticket for the visible customer.",
  inputSchema: {
    type: "object",
    properties: {
      customerId: { type: "string" },
      title: { type: "string" },
      priority: { type: "string", enum: ["low", "normal", "high"] }
    },
    required: ["title"]
  },
  mutating: true,
  confirmationCopy: "Create a ticket?",
  handler: async (args) => {
    const ticket = await crm.createTicket(args);
    return { ok: true, ticketId: ticket.id, ticketUrl: ticket.url };
  }
});
```

Handler rules:

- Match the name exactly.
- Return JSON-serializable data only.
- Catch or intentionally surface expected errors. Uncaught handler failures become `handler_threw`.
- A missing handler becomes `no_handler`.
- The SDK captures a fresh page snapshot after execution.

## DOM Privacy

Field values are omitted unless opted in:

```html
<input id="case-number" data-wp-nova-include value="CASE-2026-0142" />
```

Or:

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  safeValueSelectors: ["#case-number", ".agent-safe-field"],
});
```

Exclude sensitive regions:

```html
<section data-wp-nova-ignore>Internal notes</section>
```

Always excluded even if opted in: passwords, hidden inputs, file inputs, credit card fields, CVC/CVV, one-time codes, SSNs, tokens, secrets, account numbers, IBAN/routing fields, and PINs.

Use `data-ai-context` only for safe small facts:

```html
<span data-ai-context="currentCustomerId">cus-001</span>
```

## SPA Navigation

If the app has its own router, handle the SDK navigation event:

```ts
window.addEventListener("wp-nova:navigate", (event) => {
  const url = (event as CustomEvent<{ url: string }>).detail.url;
  router.navigate(new URL(url).pathname);
  event.preventDefault();
});
```

If the event is not prevented, the SDK falls back to normal document navigation.

## Verification

Confirm all of these before finishing:

- Backend route rejects unauthenticated callers.
- Backend route reads email from server auth state, not browser input.
- Backend route calls `{NOVA_API_URL}/embed/session` with the integration secret server-side.
- Backend route passes through token and unavailable responses unchanged.
- Frontend config contains only public values.
- Surface allowed origins include the exact browser origins.
- At least one useful page tool is registered with `registerTool`.
- Mutating tool triggers iframe confirmation before the handler runs.
- Agent can summarize visible page content.
- Sensitive field values and `data-wp-nova-ignore` regions are absent from snapshots.
- Unmapped user shows unavailable state.
- Forced token expiry or 401 causes the SDK to call `tokenEndpoint` again.

## Common Failure Modes

| Symptom | Fix |
| --- | --- |
| Chat shows unavailable user | Add or activate the matching Nova tenant user, or confirm the asserted email. |
| Nova returns origin error | Add the exact host origin to the surface and forward `origin` from SDK to Nova. |
| SDK shows transport error | Check `NOVA_API_URL`, backend reachability, response JSON, and integration secret. |
| Tool returns `no_handler` | Ensure the SDK still has a `registerTool` definition for the requested tool name. |
| Mutating tool does nothing | User likely declined confirmation or handler threw. Check console/server logs. |
| Snapshot omits a safe value | Add `data-wp-nova-include` or `safeValueSelectors`, and ensure it is not sensitive. |
| SPA route does not change | Handle `wp-nova:navigate` or use normal same-origin links. |
| Launcher never appears; `sdk.js` 404s | The pinned SDK version is not deployed at `https://chat.wp-nova.ai/sdk/<version>/sdk.js`. Confirm the version and `.sri`; for local dev, self-host the released `dist/index.global.js` from your own origin. |
| `@wp-nova/chat-sdk-angular` import fails to resolve | The `1.0.0` publish shipped without entry points. Upgrade to `1.0.1`+, or install the built `dist` directly (e.g. `npm pack packages/angular/dist`). Core and React `1.0.x` resolve normally. |

## Useful Source Files When Working in Nova Repos

```text
~/Dev/chat-sdk/packages/chat-sdk/src/types.ts
~/Dev/chat-sdk/packages/chat-sdk/src/token.ts
~/Dev/chat-sdk/packages/chat-sdk/src/navigation.ts
~/Dev/chat-sdk/packages/chat-sdk/src/snapshot.ts
~/Dev/chat-sdk/packages/react/src/index.tsx
~/Dev/chat-sdk/packages/angular/src/lib/
~/Dev/nova-ark/apps/g8way/src/modules/auth/embed/embed-session.controller.ts
~/Dev/nova-ark/packages/types/src/embedded/
~/Dev/nova-ark/apps/fronto/src/modules/chat/embed/
~/Dev/nova-ark/apps/embed-test-site/
```
