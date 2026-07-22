---
id: angular
title: Angular
---

## Angular

`@wp-nova/chat-sdk-angular` fournit un service Angular, un provider d'environnement et un composant standalone.

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
      description: "Affiche un message bref et non persistant dans la page hôte.",
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

Sinon, `<wp-nova-chat-mount [tools]="tools" />` reçoit des définitions
complètes. Filtrez routes/outils par permissions et émettez
`wp-nova:settled` après le rendu des données de la route Angular.
