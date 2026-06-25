---
id: react
title: React
---

## React

`@wp-nova/sdk-react` encapsule le SDK navigateur sans l’importer pendant le rendu serveur.

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

Le provider s’initialise une seule fois côté client. Les outils gérés par le wrapper sont désenregistrés au démontage.
