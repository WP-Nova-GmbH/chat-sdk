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

## Registering Tools with Definitions

If your tools are stable inside one component, pass them through the `tools` prop:

```tsx
import { useMemo } from "react";
import { NovaChatProvider, type NovaToolDefinition } from "@wp-nova/chat-sdk-react";

export function App() {
  const tools = useMemo<NovaToolDefinition[]>(
    () => [
      {
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
        const ticket = await crm.createTicket({
          title: String(args.title ?? "Follow up"),
          priority: String(args.priority ?? "normal"),
        });
          return { ok: true, ticketId: ticket.id, ticketUrl: ticket.url };
      },
      },
    ],
    [],
  );

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
  useNovaTool({
    name: "set_customer_status",
    description: "Changes the status for the current customer in the CRM.",
    inputSchema: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        status: { type: "string", enum: ["active", "review", "paused"] },
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

  return null;
}
```

Mutating tools are confirmed in the iframe before the SDK calls your handler.
Handlers may accept an optional second argument, `{ signal }`, an `AbortSignal`
the SDK aborts when the bridge times the tool round-trip out, so long-running or
mutating handlers can cancel in-flight work: `handler: async (args, { signal } = {}) => { ... }`.

## Conditional Mounting

Use `enabled={false}` when a user, tenant, or environment should not mount chat.

```tsx
<NovaChatProvider config={novaConfig} enabled={Boolean(user?.canUseNova)}>
  <Routes />
</NovaChatProvider>
```

When disabled, the wrapper removes the launcher and unregisters wrapper-owned handlers.
