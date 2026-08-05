---
id: dom-access
title: Giving the agent DOM access
---

Nova cannot run arbitrary JavaScript in the host page. It can only use capabilities that are explicitly exposed through the SDK:

- Visible Page Snapshots.
- Built-in page actions enabled by the Embedded Chat Surface.
- SDK-defined page tools registered with their contract and handler by your app;
  the surface Page Tools setting is the server-side allow/deny gate.

## Page Snapshots

When the iframe sends `REQUEST_SNAPSHOT`, the SDK captures what the user can see:

- Page URL, path, title, and current selection.
- Visible text and document structure.
- Visible links with accessible labels and hrefs.
- Visible controls with labels, roles, and stable handles.
- Structured metadata such as selected meta tags and JSON-LD.
- Explicit `data-ai-context` fields.
- Language signals kept separate from visible text: the normalized host
  `locale`, the document's `lang`, and the browser's preferred locales.
- Field values only when they opt in and pass sensitivity checks.

The SDK does not send screenshots or raw DOM HTML. Closed shadow roots, cross-origin iframes, canvas/WebGL regions, virtualized content, and oversized pages can make the snapshot `partial` or `truncated`.

Language signals are hints, not authorization or instructions. `hostLocale` is
the canonical BCP 47 value explicitly supplied through `SdkConfig.locale`;
`documentLocale` and `browserLocales` are reported separately from the page and
browser. Automatic workflows can use these hints to format a response, but the
host application's permission and data rules remain authoritative.

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

With Page Navigation enabled, Nova can navigate, click/open visible controls,
set filters, scroll, and refresh context using handles from the latest snapshot.
The SDK returns a fresh snapshot after each action. See
[Navigation and async pages](./navigation.md) for routing and readiness behavior.

Use real labeled links and buttons. A framework-only click handler on a
non-interactive row or container may not appear in the snapshot as an actionable
control.

## Integrator-Defined Page Tools

Your integration owns SDK tool definitions and handlers; Nova admin supplies the
surface-level Page Tools gate. See [Tools and guided workflows](./tools.md) for
registration, limits, permissions, confirmations, and safe workflow patterns.
