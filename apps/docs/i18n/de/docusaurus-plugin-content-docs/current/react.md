---
id: react
title: React
---

## React

`@wp-nova/sdk-react` umhüllt das Browser-SDK, ohne es während des Server-Renderings zu importieren.

```bash
npm install @wp-nova/sdk @wp-nova/sdk-react
```

```tsx
import { NovaChatProvider, useNovaTool } from "@wp-nova/sdk-react";

function CustomerTools() {
  useNovaTool("create_ticket", async (args) => {
    return crm.createTicket(args);
  });

  return null;
}

export function App() {
  return (
    <NovaChatProvider
      config={{
        publicSurfaceId: "srf_live_...",
        tokenEndpoint: "/api/nova-token",
      }}
    >
      <CustomerTools />
      <Routes />
    </NovaChatProvider>
  );
}
```

Der Provider initialisiert einmalig im Client. Tools, die vom Wrapper verwaltet werden, werden beim Unmount wieder deregistriert.
