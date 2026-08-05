---
id: react
title: React
---

## React

`@wp-nova/chat-sdk-react` umhüllt das Browser-SDK, ohne es während des Server-Renderings zu importieren.

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
    description: "Erstellt ein Support-Ticket für den sichtbaren Kundenkontext.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
    mutating: true,
    confirmationCopy: "Dieses Ticket erstellen?",
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

Der Provider initialisiert einmalig im Client. Tools, die vom Wrapper verwaltet werden, werden beim Unmount wieder deregistriert.

Halte Konfiguration, Routen und Tool-Definitionen mit
`useMemo`/`useCallback` stabil, filtere sie nach Berechtigungen und mounte
den Provider oberhalb des Route-Outlets. Asynchrone Routen müssen nach
`wp-nova:navigate` mit `wp-nova:settled` ihre Readiness signalisieren.

Leite `config.theme` aus dem aktuellen Hell-/Dunkelzustand der Host-Anwendung
ab. Bei einer Änderung aktualisiert der Provider Launcher, Panel und bestehendes
iframe ohne neuen Token-Abruf oder Verlust der Konversation.
`triggerColorLight` und `triggerColorDark` aktualisieren den vorhandenen
Launcher, ohne ihn neu zu mounten.

### Umschaltbarer Pop-over und Sidebar

Verwende einen stabilen Grid-/Flex-Container als `mount` und nimm
`presentation` in die Provider-Konfiguration auf. Der React-Wrapper behandelt
den Inhalt von `presentation` als relevante Konfiguration und ruft bei einer
Änderung `init()` erneut auf, ohne das iframe zu ersetzen:

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
          Darstellung wechseln
        </button>
        <Routes />
      </main>
    </div>
  </NovaChatProvider>
);
```

Der Container muss vor Ausführung des Provider-Effekts existieren. Verwende
`grid-template-columns: minmax(0, 1fr) auto`, setze `min-width: 0` am
Hauptinhalt und stelle eine Blockhöhe bereit. Ein Moduswechsel erhält iframe,
Authentifizierung, Tools, Öffnungszustand und Konversation. Breitenvalidierung
und responsiver Fallback sind unter
[Konfiguration: Darstellung](./configuration.md#darstellung) beschrieben.
Ohne `resizable` bleibt die Breite fest. Bei aktiviertem Ziehen sollte die
Host-Anwendung `event.detail.width` aus `wp-nova:sidebar-resize` speichern.

### Eigener Launcher

Setze `launcher: false` und verwende die Hooks für einen Button im Design der
Host-Anwendung:

```tsx
function AssistantButton() {
  const chat = useNovaChat();
  const open = useNovaChatOpenState();

  return (
    <button aria-expanded={open} onClick={() => void chat.toggle()}>
      {open ? "Assistent schließen" : "Assistent öffnen"}
    </button>
  );
}
```

`useNovaChat()` stellt `open()`, `close()` und `toggle()` bereit.
`useNovaChatOpenState()` bleibt auch beim Minimieren innerhalb des iframes
synchron.
