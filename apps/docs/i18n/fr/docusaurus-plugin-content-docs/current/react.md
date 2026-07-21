---
id: react
title: React
---

## React

`@wp-nova/chat-sdk-react` encapsule le SDK navigateur sans l’importer pendant le rendu serveur.

```bash
npm install @wp-nova/chat-sdk @wp-nova/chat-sdk-react
```

```tsx
import { NovaChatProvider, useNovaTool } from "@wp-nova/chat-sdk-react";

function CustomerTools() {
  useNovaTool({
    name: "create_ticket",
    description: "Crée un ticket de support pour le contexte client visible.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
    mutating: true,
    confirmationCopy: "Créer ce ticket ?",
    handler: async (args) => crm.createTicket(args),
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

Stabilisez config, routes et définitions avec `useMemo`/`useCallback`,
filtrez-les par permissions et montez le provider au-dessus de l’outlet. Les
routes asynchrones doivent émettre `wp-nova:settled` après leur rendu.
