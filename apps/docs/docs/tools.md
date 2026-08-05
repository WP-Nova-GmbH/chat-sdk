---
id: tools
title: Tools and guided workflows
---

Nova embedded chat can use conversation tools, built-in page controls, SDK-defined host tools, and server-side backend tools. They have different owners and security rules.

## Tool categories

| Category | Examples | Owner | Host handler? |
| --- | --- | --- | --- |
| Conversation | `request_user_input` | Nova iframe/backend | No. The iframe renders and answers the choice card. |
| Site capability discovery | `get_site_capabilities` | Nova defines; host provides the live result | `siteCapabilities.provider` in SDK config. Requires Page Tools. |
| Built-in page control | `navigate`, `click`, `open_record`, `set_filter`, `scroll_to`, `refresh_context` | Nova declares; SDK executes | No custom handler. Requires Page Navigation. |
| SDK-defined host tool | `list_customers`, `create_ticket`, `set_customer_status` | Your integration | Yes, registered with the complete tool definition. Requires Page Tools. |
| Backend tool | `call_intervention_history`, domain-specific research tools | Your server/Nova connection | No browser handler. Configure and authorize server-to-server. |
| Nova server tool | Knowledge search or other Nova-side capabilities | Nova | No host-page handler. Availability depends on the Nova agent. |

Do not register `request_user_input` or a built-in page-control name. Those names are reserved. Browser tools execute sequentially across turns; design a multi-step workflow as a sequence of grounded calls, not parallel browser operations.

Backend tools are not SDK-defined page tools. Keep their API keys, schemas,
catalogs, and permission checks on the server. Automatic page workflows may use
only the read-only tools listed in `availableBackendTools`; write tools remain
confirmation-gated chat actions. See [Automatic page workflows](./page-workflows.md)
for connection keys, contract versions, required evidence, and citations.

## Built-in page controls

When Page Navigation is enabled, Nova can advertise these actions:

| Action | Behavior | Confirmation |
| --- | --- | --- |
| `navigate` | Opens a same-origin URL, preferably from declared routes or a captured href. | No |
| `click` | Clicks a visible control by the latest handle. | Yes; arbitrary controls may mutate. |
| `open_record` | Opens a visible record by durable URL or current handle. | Yes; the fallback can click host UI. |
| `set_filter` | Updates a visible search/filter control and emits input/change events. | No |
| `scroll_to` | Scrolls a current handle into view. | No |
| `refresh_context` | Captures a fresh page snapshot without changing the page. | No |

`highlight` is reserved by the SDK protocol but is not currently advertised as an agent capability. Do not design a workflow that depends on it.

The agent prefers URLs over element handles because URLs survive background re-renders. Handles belong only to the latest snapshot.

## Describe Everything Nova Can Do on the Site

Configure `siteCapabilities` when the site's available features are broader
than its current routes and callable tools—for example automatic page workflows,
background assistance, feature-flagged modules, or abilities that Nova should
explain but does not invoke through a dedicated tool.

Nova owns the `get_site_capabilities` name, empty schema, read-only
classification, and default description. That description tells the model to
call it before every answer about what it can do, how it can help, what the site
offers, or whether a site-specific task is supported. The host owns only a live
provider result:

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  siteCapabilities: {
    provider: () => ({
      features: ["Search customers", "Create support tickets"],
      automaticWorkflows: [
        "Prepare a renewal summary when an eligible customer page opens",
      ],
      limitations: ["Refund approval is not available to this user"],
    }),
  },
});
```

Keep the result permission-aware, user-facing, JSON-serializable, and below the
32 KiB tool-result limit. The surface's Page Tools setting must be enabled.
See [Site capability discovery](./configuration.md#site-capability-discovery)
for dynamic permission filtering and the optional description override.

## Register an SDK-defined tool

Keep the agent-facing contract and implementation together:

```ts
import { registerTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "create_ticket",
  description:
    "Creates a support ticket after the customer and title have been resolved.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      customerId: { type: "string", description: "Stable customer UUID." },
      title: { type: "string", minLength: 1 },
      priority: { type: "string", enum: ["low", "normal", "high"] },
    },
    required: ["customerId", "title"],
  },
  mutating: true,
  confirmationCopy: "Create this support ticket?",
  handler: async (args, { signal } = {}) => {
    const result = validateCreateTicket(args);
    if (!result.ok) {
      return {
        ok: false,
        code: "validation_error",
        message: result.message,
        issues: result.issues,
      };
    }

    const ticket = await crm.createTicket(result.value, { signal });
    return {
      ok: true,
      ticketId: ticket.id,
      url: `/tickets/${ticket.id}`,
    };
  },
});
```

The surface's Page Tools setting decides whether Nova accepts the registered definition. Nova validates the spec again and its mutation classification is authoritative for the iframe confirmation gate.

## Definition limits

A definition must satisfy both SDK and Nova validation:

- Name starts with a lowercase letter and contains only lowercase letters, numbers, and underscores.
- Built-in names are reserved.
- Description is meaningful and at least 20 characters; Nova accepts at most 2,000.
- `inputSchema` is a plain JSON Schema object, at most 16 KiB, no more than 8 levels deep, and contains at most 500 object keys.
- `mutating` is an explicit boolean.
- A mutating tool has user-facing `confirmationCopy` (at most 500 characters).
- A surface turn accepts at most 50 SDK-defined tools.
- Handler arguments and results are JSON-serializable; keep results well below Nova's 32 KiB tool-result limit.

Prefer simple provider-compatible schemas. Some model providers reject complex top-level `anyOf`/`oneOf` combinations in function declarations. Put cross-field requirements in the description, perform a small preflight when helpful, and always validate conditional rules in the handler.

## Design read-only lookup tools first

A dedicated read-only tool is more reliable than making the agent navigate a paginated or virtualized UI to discover identifiers.

Good lookup tools:

- use the same permission-aware service as the product UI;
- support a bounded search term;
- return stable machine ids separately from localized display labels;
- include dependent valid values, such as a supplier's available categories;
- return stable same-origin URLs when records can be opened;
- cap results and return `truncated: true` when more matches exist;
- describe exactly when the agent must call them.

```ts
registerTool({
  name: "list_customers",
  description:
    "Authoritative customer lookup for the signed-in user. Use before a workflow needs a customer id; refine when results are truncated.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      search: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
  mutating: false,
  handler: async ({ search }, { signal } = {}) => {
    const matches = await crm.searchCustomers(String(search ?? ""), { signal });
    return {
      customers: matches.slice(0, 12).map((customer) => ({
        id: customer.id,
        label: customer.displayName,
        description: customer.address,
        url: `/customers/${customer.id}`,
      })),
      truncated: matches.length > 12,
    };
  },
});
```

If the tool returns two to twelve grounded candidates and a choice is required, Nova can use `request_user_input` to show an inline choice card. Exactly one valid candidate can normally be selected automatically. More than twelve or incomplete results should trigger a narrower lookup or free-text search, not an invented or supposedly exhaustive list.

## Make mutating workflows safe to continue

For a mutation handler:

1. Recheck permission/tenant scope and validate arguments plus current domain rules.
2. Resolve names to stable ids; never use row positions or page handles as domain ids.
3. Honor the optional `AbortSignal` and call the app's normal service/mapper.
4. Return expected failures as structured data; throw only unexpected failures.
5. On success, refresh visible data and return a stable URL.

The iframe owns confirmation; do not add another dialog. The SDK de-duplicates
re-issued calls with the same Nova idempotency key, but critical APIs should also
be idempotent. If creation succeeds and only cache refresh fails, return success
to avoid a duplicate retry.

## Return actionable errors

Model expected outcomes explicitly:

```ts
type ToolFailure =
  | { ok: false; code: "forbidden"; message: string }
  | { ok: false; code: "not_found"; message: string; candidates?: Candidate[] }
  | { ok: false; code: "ambiguous"; message: string; candidates: Candidate[] }
  | { ok: false; code: "validation_error"; message: string; issues: FieldIssue[] }
  | { ok: false; code: "conflict"; message: string };
```

Bound messages, omit secrets/internal dumps, and state whether retry requires new input, a refreshed lookup, or user action.

## Register only what the user may use

Tool registration is capability exposure. Gate each tool with the same role, resource, customer, module, and feature checks as its UI action.

Unregister tools on permission changes and teardown. See the [React guide](./react.md) for stable definitions and hooks.

## Verification matrix

Test at least:

| Scenario | Expected result |
| --- | --- |
| Gate or permission disabled | Tool is absent and direct API use is rejected. |
| Lookup returns 1 / 2–12 / truncated results | Agent selects the one match, asks with grounded choices, or refines the search. |
| Invalid or conflicting input | No mutation; structured field/candidate guidance is preserved. |
| Mutation accepted or declined | Iframe confirms once; the handler runs only after acceptance. |
| Missing, timed-out, or aborted handler | Typed actionable error; no late side effect starts. |
| Success | Visible data refreshes and the result includes a stable same-origin URL. |
