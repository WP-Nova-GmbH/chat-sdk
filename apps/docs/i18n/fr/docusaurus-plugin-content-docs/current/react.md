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

### Pop-over et barre latérale interchangeables

Utilisez un conteneur grid/flex stable comme `mount` et incluez
`presentation` dans la configuration du provider. Le wrapper React considère
le contenu de `presentation` comme une configuration significative et rappelle
`init()` lors d’un changement sans remplacer l’iframe :

```tsx
const [mode, setMode] = useState<"popover" | "sidebar">("popover");
const config = useMemo(
  () => ({
    ...novaConfig,
    mount: "#nova-layout",
    presentation:
      mode === "sidebar"
        ? ({ mode: "sidebar", width: 420, resizable: true } as const)
        : ({ mode: "popover" } as const),
  }),
  [mode],
);

return (
  <NovaChatProvider config={config}>
    <div id="nova-layout" className="nova-layout">
      <main>
        <button
          type="button"
          onClick={() =>
            setMode((value) =>
              value === "popover" ? "sidebar" : "popover"
            )
          }
        >
          Changer la présentation
        </button>
        <Routes />
      </main>
    </div>
  </NovaChatProvider>
);
```

Le conteneur doit exister avant l’exécution de l’effet du provider. Utilisez
`grid-template-columns: minmax(0, 1fr) auto`, appliquez `min-width: 0` au
contenu principal et fournissez une hauteur disponible. Le changement de mode
préserve l’iframe, l’authentification, les outils, l’état ouvert/fermé et la
conversation. La validation de largeur et le fallback responsive sont décrits
dans [Configuration : présentation](./configuration.md#présentation).
Sans `resizable`, la largeur reste fixe. Lorsque le glisser est activé,
l’application hôte doit enregistrer `event.detail.width` depuis
`wp-nova:sidebar-resize`.

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
