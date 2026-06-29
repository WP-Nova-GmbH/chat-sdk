---
id: api-reference
title: API reference
---

## Global Dispatcher

The script-tag build installs `window.WpNova`. Calls made before the SDK loads are queued and replayed in order.

```ts
WpNova("init", config);
WpNova("registerTool", tool);
WpNova("unregisterTool", name);
WpNova("destroy");
```

## npm Helpers

```ts
import {
  WpNova,
  init,
  destroy,
  registerTool,
  unregisterTool,
  defineElement,
  ELEMENT_TAG,
  WpNovaChatElement,
} from "@wp-nova/chat-sdk";
```

`WpNova(command, ...args)` and the named helpers call the same singleton controller.

## SdkConfig

```ts
export interface SdkConfig {
  publicSurfaceId: string;
  tokenEndpoint: string;
  baseUrl?: string;
  mount?: string | HTMLElement;
  title?: string;
  accent?: string;
  triggerColor?: string;
  triggerIconColor?: "light" | "dark" | string;
  safeValueSelectors?: string[];
  voiceMode?: boolean;
  protocolVersion?: number;
}
```

Required fields:

- `publicSurfaceId`: non-secret `surf_...` handle from Nova admin.
- `tokenEndpoint`: your backend route that proxies Nova `POST /embed/session`.
- `voiceMode`: enables the embedded voice button and delegates microphone access to the Nova iframe. Defaults to `false`.

## Page Tools

```ts
export type ToolHandler = (
  args: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
) => unknown | Promise<unknown>;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutating: boolean;
  confirmationCopy?: string;
  handler: ToolHandler;
}
```

```ts
registerTool({
  name: "create_ticket",
  description: "Creates a support ticket from the current customer context.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  mutating: true,
  confirmationCopy: "Create this ticket?",
  handler: async (args) => {
    return crm.createTicket({
      title: String(args.title ?? ""),
    });
  },
});

unregisterTool("create_ticket");
```

Handler results must be JSON-serializable. The SDK captures a fresh snapshot
after a successful handler. Handler failures are reported as typed bridge errors.
The optional `opts.signal` is an `AbortSignal` the SDK aborts when the bridge times
the tool round-trip out, so a cooperating handler can stop a long-running or
mutating action.

`registerToolHandler(name, handler)` and `unregisterToolHandler(name)` remain
available as deprecated execution-only compatibility helpers. Handler-only tools
are not advertised to the agent.

## Token Endpoint Contract

The SDK request:

```http
POST /api/nova-token
Content-Type: application/json

{ "publicSurfaceId": "surf_...", "origin": "https://app.example.com" }
```

The SDK sends credentials with the request so your own session cookie is included.

Your endpoint returns one of these Nova responses:

```ts
export interface TokenGrantResponse {
  access_token: string;
  expires_in: number;
  displaySettings?: {
    title?: string;
    logo?: string;
    accent?: string;
    triggerColor?: string;
    triggerIconColor?: string;
  } | null;
  developmentMode?: boolean;
  unavailable?: false;
}
```

```ts
export interface UnavailableUserResponse {
  unavailable: true;
  email: string;
  message: string;
  access_token?: undefined;
}
```

Non-2xx responses and malformed bodies are treated as token transport errors. `{ unavailable: true }` is a valid terminal state, not a transport error.

## Page Context Types

```ts
export interface PageContext {
  url: string;
  path?: string;
  title?: string;
  selection?: string;
  structuredData?: {
    jsonLd?: unknown[];
    meta?: Record<string, string>;
  };
  aiFields?: Record<string, string | undefined>;
  snapshot?: VisiblePageSnapshot;
}

export interface VisiblePageSnapshot {
  visibleText?: string;
  links?: VisibleLink[];
  controls?: VisibleControl[];
  // Metadata for visible field values the privacy policy withheld:
  // labels/types/reasons only, never the value itself.
  omittedValues?: OmittedFieldValue[];
  handles?: ElementHandle[];
  truncated?: boolean;
  partial?: boolean;
}
```

Handles are valid only for the snapshot that issued them. Every tool result returns a fresh snapshot with re-issued handles.

## Custom Element

The SDK defines `<wp-nova-chat>` lazily and idempotently. You can pre-place the element in the DOM, but most integrations should let `init` create and mount it.

```ts
import { ELEMENT_TAG, defineElement } from "@wp-nova/chat-sdk";

defineElement();
console.log(ELEMENT_TAG); // "wp-nova-chat"
```

## Browser Events

For same-origin navigation, the SDK dispatches a cancelable event before falling back to document navigation:

```ts
window.addEventListener("wp-nova:navigate", (event) => {
  const url = (event as CustomEvent<{ url: string }>).detail.url;
  router.navigate(new URL(url).pathname);
  event.preventDefault();
});
```

Use this in SPAs that want Nova navigation actions to route through the app router.
