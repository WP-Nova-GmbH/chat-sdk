---
id: react
title: React
---

## React

`@wp-nova/sdk-react` wraps the browser SDK without importing it during server render.

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

The provider initializes once on the client. Wrapper-owned tools are unregistered on unmount.
