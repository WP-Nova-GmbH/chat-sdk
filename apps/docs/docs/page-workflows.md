---
id: page-workflows
title: Automatic page workflows
---

Automatic page workflows start a bounded `research-and-compose` run when a
matching page is open and ready. They are host-triggered and page-scoped; they
do not run on every route or replace ordinary chat history.

## Configure a workflow

Add `pageWorkflows` to the same `init` configuration as `routes` and `locale`:

```ts
import { init } from "@wp-nova/chat-sdk";

init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  locale: "en-GB",
  pageWorkflows: [
    {
      id: "summarize-call-intervention",
      path: "/call-center/interventions/:interventionId",
      execution: {
        mode: "research-and-compose",
        availableBackendTools: [
          {
            connectionKey: "telect",
            toolId: "call_intervention_history",
            contractVersion: "2",
          },
          {
            connectionKey: "telect",
            toolId: "call_intervention_callbacks",
            contractVersion: "2",
          },
          {
            connectionKey: "telect",
            toolId: "call_intervention_operational_context",
            contractVersion: "2",
          },
        ],
      },
      requiredTools: [
        {
          id: "intervention_context",
          tool: {
            location: "backend",
            connectionKey: "telect",
            toolId: "call_intervention_context",
            contractVersion: "4",
          },
          inputs: {
            interventionId: { kind: "path", parameter: "interventionId" },
          },
          outputAssertions: [
            { pointer: "/intervention/id", operator: "nonEmpty" },
            { pointer: "/version", operator: "equals", value: 4 },
            { pointer: "/evidenceRevision", operator: "exists" },
            { pointer: "/ready", operator: "equals", value: true },
          ],
        },
      ],
      prompt:
        "Write a concise operator handover for the loaded intervention. Cite evidence as [source:s1]. State evidence gaps briefly and do not invent details.",
    },
  ],
});
```

Each `PageWorkflowDefinition` has an SDK-local `id`, an exact `path`, a
`prompt`, and `execution.mode: "research-and-compose"`. A `:param` consumes one
path segment and its value can be passed to a required tool with a `path`
binding. Literal values use `{ kind: "literal", value }`.

`availableBackendTools` are optional read-only research tools. Each entry names
a server-side connection with `connectionKey`, `toolId`, and a string
`contractVersion`. A `requiredTools` entry is deterministic preflight evidence:
it can reference a `site` or `backend` tool and can validate its JSON result
against the tool's declared output schema plus RFC 6901 pointers and `exists`,
`nonEmpty`, or `equals` assertions. Required tools must be non-mutating.

## Readiness and lifecycle

The SDK starts a matching workflow only when all of these are true:

- the current URL matches exactly, including the resolved path parameters;
- the host has marked the current URL ready with `setPageReady(true)`;
- the panel is open, the iframe is ready, authentication is granted, and the
  iframe advertises the `page-workflows` capability.

Call `setPageReady(false)` while route data is being replaced, then call
`setPageReady(true)` after the destination and its data have rendered. This
workflow readiness signal is separate from `wp-nova:settled`, which only ends a
pending post-navigation snapshot settle. In React, the same controller method
is available from `useNovaChat()`. For async router navigation, handle
`wp-nova:navigate` and dispatch `wp-nova:settled` only after the requested URL,
component, and route data are ready. Re-assert workflow readiness when chat
opens after the page was already loaded.

The workflow attempt is tied to the exact URL. A different URL replaces local
attempt state when the host reasserts readiness for that URL; a started server
run continues and may be cached. A same-URL readiness refresh keeps an
already-started run and its correlation; after a completed run, a new readiness
cycle may evaluate it again. Closing before a run starts cancels it.

The iframe reports `started`, `cached`, `completed`, `failed`, or `skipped`.
The embedded UI shows a page-scoped card with bounded progress such as page
read, transcript analyzed, and open points extracted. A completed result can be
continued in the current conversation or materialized into a new conversation;
materialization persists as ordinary chat history.

## Backend tools and evidence

Backend tools are configured and authorized server-to-server. Store API keys
and connection credentials on the server, create/test the connection in Nova,
allowlist tool ids, and rotate keys through the connection administration flow.
The host backend may provide a narrow `backendToolGrants` list while minting the
session; grants are never returned to the browser. The browser does not register
a handler or receive the key. Delegated grants are scoped to the
current user, surface, session, connection, and allowed tools; authorization is
checked again when a tool executes.

Required workflow tools should be read-only, deterministic, and safe to retry.
`availableBackendTools` should list only the read tools the research loop may
use. Write tools belong in an explicitly confirmed chat action, not automatic
research. A stale or mismatched required-tool contract fails closed; an
optional research-tool failure is reported as a limitation and the workflow may
continue with remaining evidence.

Backend results may include an evidence envelope:

```ts
{
  sources: [
    {
      id: "internal-source-id",
      label: "Call record",
      description: "Current application record",
      observedAt: "2026-08-05T10:30:00Z",
    },
  ],
}
```

The `PageWorkflowEvidenceSource` id is provider-internal. The research contract
can use safe, result-local references such as `[source:s1]`; current standalone
and materialized workflow UI may strip those markers or render no visible
source chips. Prompts should still state evidence gaps, and host copy should
not promise citation chips. Do not expose API keys, provider identifiers, or
unbounded raw tool payloads. See [API reference](./api-reference.md#page-workflow-types)
for the evidence and citation types.

## Validation limits

The SDK accepts at most 20 workflows, 10 required tools per workflow, and 16
available backend tools. Workflow ids use the same lowercase/uppercase
letter-starting identifier rule as other SDK ids, prompts are 1–8,000
characters, and paths are same-origin leading-`/` paths without query strings
or hashes. Overlapping or malformed definitions are warned about and dropped;
the first valid entries win. Filter routes, workflows, and backend-tool
availability by the signed-in user's permissions before calling `init`.

For host layout, persistent sidebar mounting, and session bridging, see
[Configuration](./configuration.md), [React](./react.md), and
[Navigation and async pages](./navigation.md).
