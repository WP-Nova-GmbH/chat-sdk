---
id: angular
title: Angular
---

`@wp-nova/chat-sdk-angular` provides an Angular service, environment provider, and standalone component around the core SDK.

```bash
npm install @wp-nova/chat-sdk @wp-nova/chat-sdk-angular
```

## Provider Setup

Register the SDK config during bootstrap:

```ts
import { ApplicationConfig } from "@angular/core";
import { provideNovaChat } from "@wp-nova/chat-sdk-angular";

export const appConfig: ApplicationConfig = {
  providers: [
    provideNovaChat({
      publicSurfaceId: import.meta.env["VITE_NOVA_PUBLIC_SURFACE_ID"],
      tokenEndpoint: "/api/nova-token",
      baseUrl: import.meta.env["VITE_NOVA_BASE_URL"],
    }),
  ],
};
```

Only put browser-safe values in Angular environment files. Keep the integration secret in your backend environment.

## Component Mount

Import the standalone mount component once near the app root:

```ts
import { Component, inject } from "@angular/core";
import { NovaChatComponent, type ToolDefinition } from "@wp-nova/chat-sdk-angular";

@Component({
  standalone: true,
  selector: "app-root",
  imports: [NovaChatComponent],
  template: `
    <router-outlet />
    <wp-nova-chat-mount [tools]="tools" />
  `,
})
export class AppComponent {
  private readonly crm = inject(CrmService);

  tools: ToolDefinition[] = [
    {
      name: "create_ticket",
      description: "Creates a support ticket from the current customer context.",
      inputSchema: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
      mutating: true,
      confirmationCopy: "Create this ticket?",
      handler: async (args) => {
      const ticket = await this.crm.createTicket({
        title: String(args["title"] ?? "Follow up"),
        priority: String(args["priority"] ?? "normal"),
      });
        return { ok: true, ticketId: ticket.id, ticketUrl: ticket.url };
    },
    },
  ];
}
```

The component registers SDK tool definitions in `tools` and unregisters old names when the input changes or the component is destroyed.

## Service API

Use `NovaChatService` when registration belongs in a service or feature initializer:

```ts
import { Injectable, inject } from "@angular/core";
import { NovaChatService } from "@wp-nova/chat-sdk-angular";

@Injectable({ providedIn: "root" })
export class CustomerToolRegistration {
  private readonly nova = inject(NovaChatService);

  register() {
    this.nova.registerTool({
      name: "show_toast",
      description: "Shows a short non-persistent message in the host page.",
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

Mutating tools are confirmed in the iframe before the SDK calls your handler.

## Disabling Chat

Use the component's `enabled` input when a tenant or route should not mount chat:

```html
<wp-nova-chat-mount [enabled]="canUseNova" [tools]="tools" />
```

When disabled, the wrapper destroys the SDK mount and unregisters component-owned handlers.
