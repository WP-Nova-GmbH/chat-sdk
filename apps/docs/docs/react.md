---
id: react
title: React
---

`@wp-nova/chat-sdk-react` wraps the browser SDK without importing it during server render. Install both the core package and the React wrapper:

```bash
npm install @wp-nova/chat-sdk @wp-nova/chat-sdk-react
```

## Provider Setup

Mount `NovaChatProvider` once near the top of your client-side app. It initializes the singleton SDK and cleans up wrapper-owned tool handlers on unmount.

```tsx
import { NovaChatProvider } from "@wp-nova/chat-sdk-react";
import { Routes } from "./Routes";

const novaConfig = {
  publicSurfaceId: import.meta.env.VITE_NOVA_PUBLIC_SURFACE_ID,
  tokenEndpoint: "/api/nova-token",
  baseUrl: import.meta.env.VITE_NOVA_BASE_URL,
  routes: [
    { path: "/customers", description: "Customer lookup list with search" },
    {
      path: "/customers/:customerId",
      description: "Customer detail; obtain customerId from /customers",
    },
  ],
  settle: {
    maxWaitMs: 5000,
    waitForNavigationSignal: true,
  },
};

export function App() {
  return (
    <NovaChatProvider config={novaConfig}>
      <Routes />
    </NovaChatProvider>
  );
}
```

Only expose browser-safe values through `VITE_*` or equivalent public env variables. Keep `NOVA_INTEGRATION_SECRET` on the backend.

Derive `config.theme` from the host application's current `light`/`dark` state.
When it changes, the provider re-initializes the singleton in place: the core
updates the existing launcher, panel, and iframe without a new token request or
conversation reset. Changes to `triggerColorLight` and `triggerColorDark`
update the existing launcher without remounting. Keep the config memoized as
described below.

## Registering Tools with Definitions

If your tools are stable inside one component, pass them through the `tools` prop:

```tsx
import { NovaChatProvider, type NovaToolDefinition } from "@wp-nova/chat-sdk-react";

const createTicketTool: NovaToolDefinition = {
  name: "create_ticket",
  description: "Creates a support ticket from the current customer context.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  mutating: true,
  confirmationCopy: "Create this ticket?",
  handler: async (args) => crm.createTicket({ title: String(args.title ?? "Follow up") }),
};
const tools = [createTicketTool] as const;

export function App() {
  return (
    <NovaChatProvider config={novaConfig} tools={tools}>
      <Routes />
    </NovaChatProvider>
  );
}
```

## Registering Tools with a Hook

Use `useNovaTool` when a tool belongs to a feature component and should unregister when that component unmounts.

```tsx
import { useNovaTool } from "@wp-nova/chat-sdk-react";

function CustomerTools() {
  useNovaTool(createTicketTool);

  return null;
}
```

`createTicketTool` can be the same `NovaToolDefinition` used in the `tools` prop.
See [Tools and guided workflows](./tools.md) for confirmation, abort, and handler rules.

Keep definitions and handlers referentially stable with `useMemo`/`useCallback`
so renders do not churn registration. Filter routes and tools with the signed-in
user's permissions. If React Router destinations load data asynchronously,
handle `wp-nova:navigate` and signal `wp-nova:settled` after the exact route
and its required queries have rendered. See
[Navigation and async pages](./navigation.md).

## Conditional Mounting

Use `enabled={false}` when a user, tenant, or environment should not mount chat.

```tsx
<NovaChatProvider config={novaConfig} enabled={Boolean(user?.canUseNova)}>
  <Routes />
</NovaChatProvider>
```

When disabled, the wrapper removes the launcher and unregisters wrapper-owned handlers.

For bearer-authenticated SPAs, do not pass the bearer token into SDK config.
Bootstrap a short-lived `HttpOnly` backend session before enabling the provider;
the SDK's token request carries cookies, not the host app's custom authorization
header. See [Plan your integration](./planning.md#select-the-authentication-pattern).
