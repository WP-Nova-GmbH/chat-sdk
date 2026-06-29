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
    this.nova.registerToolHandler("show_toast", async (args) => {
      return { ok: true, message: String(args["message"] ?? "") };
    });
  }
}
```
