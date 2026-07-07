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

These reads use `import.meta.env`, which a Vite-based Angular build (like the
`release-examples/angular` app in this repo) populates from `VITE_*` variables.
With the Angular CLI builder, read the same values from an `environment.ts` file
instead. Either way, only put browser-safe values in client config and keep the
integration secret in your backend environment.

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
Handlers may accept an optional second argument, `{ signal }`, an `AbortSignal`
the SDK aborts when the bridge times the tool round-trip out, so long-running or
mutating handlers can cancel cleanly: `handler: async (args, { signal } = {}) => { ... }`.

## Disabling Chat

Use the component's `enabled` input when a tenant or route should not mount chat:

```html
<wp-nova-chat-mount [enabled]="canUseNova" [tools]="tools" />
```

When disabled, the wrapper releases its retained mount (refcounted) and
unregisters its tools. The shared chat element is torn down once the last mount
releases, so disabling one mount never destroys another's live chat.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `@wp-nova/chat-sdk-angular` fails to resolve or imports have no entry point | You have the broken `1.0.0` publish, whose package root shipped without `main`/`module`/`types`/`exports`. Upgrade to `1.0.1` or later, which republishes the wrapper from its built `dist`. For immediate local work, consume the built package directly (for example, install a tarball produced by `npm pack packages/angular/dist`, as `release-examples/angular` does). |
| `<wp-nova-chat-mount>` renders nothing | The standalone `NovaChatComponent` was not added to the consuming component's `imports`. `provideNovaChat` only registers config; the component must be imported to instantiate the element. |
| Tool state changes from the agent do not update the view | Under zoneless change detection, mutate state through signals (or call `markForCheck`) so the view refreshes after a tool handler runs. |
