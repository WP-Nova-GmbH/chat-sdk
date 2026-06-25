---
id: angular
title: Angular
---

## Angular

`@wp-nova/sdk-angular` fournit un service Angular, un provider d'environnement et un composant standalone.

```bash
npm install @wp-nova/sdk @wp-nova/sdk-angular
```

```ts
import { bootstrapApplication } from "@angular/platform-browser";
import { provideNovaChat } from "@wp-nova/sdk-angular";

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
import { NovaChatComponent, NovaChatService } from "@wp-nova/sdk-angular";

@Component({
  standalone: true,
  selector: "app-root",
  imports: [NovaChatComponent],
  template: `<wp-nova-chat-mount />`,
})
export class AppComponent {
  private readonly nova = inject(NovaChatService);

  constructor() {
    this.nova.registerToolHandler("show_toast", async (args) => {
      return { ok: true, message: String(args["message"] ?? "") };
    });
  }
}
```
