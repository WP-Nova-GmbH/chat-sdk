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
import {
  NovaChatProvider,
  useNovaChat,
  useNovaChatOpenState,
  useNovaTool,
} from "@wp-nova/chat-sdk-react";

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

Dérivez `config.theme` de l’état clair/sombre actuel de l’application hôte. En
cas de changement, le provider met à jour le lanceur, le panneau et l’iframe
existante sans récupérer de nouveau token ni perdre la conversation.
`triggerColorLight` et `triggerColorDark` mettent le lanceur existant à jour
sans remontage.

### Lanceur personnalisé

Définissez `launcher: false` et utilisez les hooks pour un bouton adapté à
l’interface de l’application hôte :

```tsx
function AssistantButton() {
  const chat = useNovaChat();
  const open = useNovaChatOpenState();

  return (
    <button aria-expanded={open} onClick={() => void chat.toggle()}>
      {open ? "Fermer l’assistant" : "Ouvrir l’assistant"}
    </button>
  );
}
```

`useNovaChat()` fournit `open()`, `close()` et `toggle()`.
`useNovaChatOpenState()` reste synchronisé même lorsque l’iframe réduit le
panneau.
