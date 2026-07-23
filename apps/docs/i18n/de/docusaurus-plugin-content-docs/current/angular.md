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
  private readonly nova = inject(NovaChatService);

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
