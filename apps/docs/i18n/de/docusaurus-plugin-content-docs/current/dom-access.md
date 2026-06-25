---
id: dom-access
title: Giving the agent DOM access
---

## Giving the Agent DOM Access

Nova cannot run arbitrary JavaScript in the host page. It can only request capabilities that the SDK exposes through page snapshots, built-in navigation actions, and tool handlers you register.

### Register Tool Handlers

```ts
import { registerToolHandler, unregisterToolHandler } from "@wp-nova/sdk";

registerToolHandler("set_customer_status", async (args) => {
  const customerId = String(args.customerId);
  const status = String(args.status);
  await crm.updateCustomer(customerId, { status });
  return { ok: true, customerId, status };
});

unregisterToolHandler("set_customer_status");
```

The set of tools the agent can ask for is declared server-side on the embedded surface. Browser registration only supplies matching execution callbacks.

### Page Snapshots

When the iframe sends `REQUEST_SNAPSHOT`, the SDK captures visible page structure, text, links, controls, labels, selection, structured data, and stable element handles. Closed shadow roots, cross-origin iframes, canvas regions, and oversized pages are marked as partial or truncated.

### Field Values Are Default-Deny

Input values are omitted unless explicitly allowed and still pass sensitivity checks.

- Add `data-wp-nova-include` to a field or ancestor.
- Or pass selectors in `safeValueSelectors`.
- Passwords, hidden inputs, files, payment fields, tokens, secrets, and similar sensitive fields are always excluded.

Use `data-wp-nova-ignore` on any subtree the assistant should not see.
