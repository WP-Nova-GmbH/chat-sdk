---
id: dom-access
title: Giving the agent DOM access
---

Nova cannot run arbitrary JavaScript in the host page. It can only use capabilities that are explicitly exposed through the SDK:

- Visible Page Snapshots.
- Built-in page actions enabled by the Embedded Chat Surface.
- Integrator-defined page tools declared on the surface and implemented by your app.

## Page Snapshots

When the iframe sends `REQUEST_SNAPSHOT`, the SDK captures what the user can see:

- Page URL, path, title, and current selection.
- Visible text and document structure.
- Visible links with accessible labels and hrefs.
- Visible controls with labels, roles, and stable handles.
- Structured metadata such as selected meta tags and JSON-LD.
- Explicit `data-ai-context` fields.
- Field values only when they opt in and pass sensitivity checks.

The SDK does not send screenshots or raw DOM HTML. Closed shadow roots, cross-origin iframes, canvas/WebGL regions, virtualized content, and oversized pages can make the snapshot `partial` or `truncated`.

## Field Values Are Default-Deny

Input values are omitted unless explicitly allowed:

```html
<input id="case-number" data-wp-nova-include value="CASE-2026-0142" />
```

You can also allow values by selector:

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  safeValueSelectors: ["#case-number", ".agent-safe-field"],
});
```

These fields are always excluded, even if opted in:

- Password, hidden, and file inputs.
- Credit card, CVC/CVV, one-time-code, current-password, and new-password autocomplete fields.
- Fields whose name, id, placeholder, or accessible label looks like a card, token, secret, password, account, IBAN, routing number, SSN, or PIN.

Field labels are still captured so the agent knows a field exists. Only the value is gated.
When a visible field has a value that is withheld, the snapshot includes
`omittedValues` metadata with the field label/type and reason (`not_opted_in` or
`sensitive`) so the agent can explain why the value is unavailable. The hidden value
itself is never sent.

## Excluding Regions

Use `data-wp-nova-ignore` on any subtree the assistant should not see:

```html
<aside data-wp-nova-ignore>
  Internal-only account notes.
</aside>
```

Hidden, off-screen, and zero-size subtrees are skipped by the visible snapshot logic.

## Structured Context

Use `data-ai-context` for small stable facts that are useful to the agent and safe to expose:

```html
<span data-ai-context="currentCustomerId">cus-001</span>
```

The SDK sends these fields in `context.aiFields`. Do not use this for secrets or sensitive values.

## Built-In Page Actions

When `pageNavigationEnabled` is enabled on the surface, Nova may offer built-in client tools for page interaction. The SDK executes supported actions against handles from the latest snapshot and returns a fresh snapshot afterward.

Common actions include:

| Action | Purpose |
| --- | --- |
| `navigate` | Navigate to a same-origin URL or follow a captured link/control. |
| `open_record` | Open a visible record or row, preferably by durable URL. |
| `set_filter` | Set a search or filter control and fire `input`/`change`. |
| `scroll_to` | Scroll a visible element into view. |
| `highlight` | Scroll to and briefly outline a visible element. |
| `refresh_context` | Ask for a fresh snapshot without changing the page. |

Same-origin URL navigation first dispatches a cancelable `wp-nova:navigate` event:

```ts
window.addEventListener("wp-nova:navigate", (event) => {
  const url = (event as CustomEvent<{ url: string }>).detail.url;
  router.navigate(new URL(url).pathname);
  event.preventDefault();
});
```

If your SPA does not prevent the event, the SDK falls back to normal document navigation.

## Integrator-Defined Page Tools

Tools the agent can call are defined by your SDK integration. Nova admin only
controls whether SDK-defined page tools are allowed for the surface.

```ts
import { registerTool, unregisterTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "set_customer_status",
  description: "Changes the visible customer's local status.",
  inputSchema: {
    type: "object",
    properties: {
      customerId: { type: "string" },
      status: { type: "string", enum: ["active", "review", "paused", "at_risk"] },
    },
    required: ["status"],
  },
  mutating: true,
  confirmationCopy: "Change this customer status?",
  handler: async (args) => {
    const customerId = String(args.customerId ?? "");
    const status = String(args.status ?? "review");
    await crm.updateCustomer(customerId, { status });
    return { ok: true, customerId, status };
  },
});

unregisterTool("set_customer_status");
```

Tool rules:

- Return JSON-serializable results.
- Throwing or rejecting is reported as `handler_threw`.
- A missing handler is reported as `no_handler`.
- Mutating tools require `confirmationCopy` and are confirmed in the iframe before execution.

After a handler runs, the SDK captures a fresh page snapshot so the agent continues from the current page state.
