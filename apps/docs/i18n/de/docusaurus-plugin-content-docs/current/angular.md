---
id: angular
title: Angular
---

## Angular

`@wp-nova/chat-sdk-angular` stellt einen Angular-Service, einen Environment Provider und eine Standalone-Komponente bereit.

```bash
npm install @wp-nova/chat-sdk @wp-nova/chat-sdk-angular
```

```ts
import { bootstrapApplication } from "@angular/platform-browser";
import { provideNovaChat } from "@wp-nova/chat-sdk-angular";

bootstrapApplication(AppComponent, {
  providers: [
    provideNovaChat({
      publicSurfaceId: "srf_live_...",
      tokenEndpoint: "/api/nova-token",
    }),
  ],
});
```

```ts
import { Component, inject } from "@angular/core";
import { NovaChatComponent, NovaChatService } from "@wp-nova/chat-sdk-angular";

@Component({
  standalone: true,
  selector: "app-root",
  imports: [NovaChatComponent],
  template: `<wp-nova-chat-mount />`,
})
export class AppComponent {
  readonly nova = inject(NovaChatService);

  constructor() {
    this.nova.registerTool({
      name: "show_toast",
      description: "Zeigt eine kurze, nicht persistente Nachricht im Host an.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
      mutating: false,
      handler: async (args) => {
        return { ok: true, message: String(args["message"] ?? "") };
      },
    });
  }
}
```

Alternativ erhält `<wp-nova-chat-mount [tools]="tools" />` vollständige
Tool-Definitionen. Filtere Routen/Tools nach Berechtigungen und signalisiere
asynchron geladene Router-Ziele erst nach dem Rendern mit
`wp-nova:settled`.

Wenn sich das Host-Theme nach dem Bootstrap ändern kann, binde die aktuelle
`SdkConfig` an den `config`-Input der Komponente oder rufe
`NovaChatService.init(updatedConfig)` auf. Ein geändertes `theme` aktualisiert
Launcher, Panel und bestehendes iframe ohne neuen Token-Abruf oder Verlust der
Konversation. `triggerColorLight` und `triggerColorDark` aktualisieren den
vorhandenen Launcher ohne Remount.

### Umschaltbarer Pop-over und Sidebar

Lege einen stabilen Grid-/Flex-Container vor
`<wp-nova-chat-mount>` an und binde bei einer Darstellungsänderung eine neue
`SdkConfig`-Referenz:

```ts
mode: "popover" | "sidebar" = "popover";
config: SdkConfig = this.buildConfig();

togglePresentation() {
  this.mode = this.mode === "popover" ? "sidebar" : "popover";
  this.config = this.buildConfig();
}

private buildConfig(): SdkConfig {
  return {
    publicSurfaceId: "surf_...",
    tokenEndpoint: "/api/nova-token",
    mount: "#nova-layout",
    presentation:
      this.mode === "sidebar"
        ? { mode: "sidebar", width: 420, resizable: true }
        : { mode: "popover" },
  };
}
```

Der Mount-Container verwendet typischerweise
`grid-template-columns: minmax(0, 1fr) auto`, eine definierte Blockhöhe und
`min-width: 0` am Hauptinhalt. Angular reagiert auf die neue
Konfigurationsreferenz; das Core-SDK erhält iframe, Authentifizierung, Tools,
Öffnungszustand und Konversation. Siehe
[Konfiguration: Darstellung](./configuration.md#darstellung) für
Breitenvalidierung und responsiven Fallback.
Ohne `resizable` bleibt die Breite fest. Bei aktiviertem Ziehen sollte die
Host-Anwendung `event.detail.width` aus `wp-nova:sidebar-resize` in einer neuen
Konfigurationsreferenz speichern.

Für einen eigenen Host-Button setze `launcher: false`. Der
`NovaChatService` stellt `open()`, `close()` und `toggle()` bereit:

```html
<button type="button" (click)="nova.toggle()">Assistent</button>
<wp-nova-chat-mount />
```
