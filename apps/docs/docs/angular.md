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
      routes: [
        { path: "/customers", description: "Customer lookup list with search" },
      ],
      settle: {
        maxWaitMs: 5000,
        waitForNavigationSignal: true,
      },
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

If the host theme can change after bootstrap, bind the current `SdkConfig` to
the component's `config` input or call `NovaChatService.init(updatedConfig)`.
Updating `theme` applies to the existing launcher, panel, and iframe without a
new token request or conversation reset. `triggerColorLight` and
`triggerColorDark` update the existing launcher without remounting.

## Switchable Pop-over and Sidebar

Bind a new `SdkConfig` reference when presentation changes. Put the empty
wrapper mount after a stable layout container in the template so the container
exists when Angular initializes the SDK:

```ts
import { Component } from "@angular/core";
import {
  NovaChatComponent,
  type SdkConfig,
} from "@wp-nova/chat-sdk-angular";

@Component({
  standalone: true,
  imports: [NovaChatComponent],
  template: `
    <div id="nova-layout" class="nova-layout">
      <main>
        <button type="button" (click)="togglePresentation()">
          Switch presentation
        </button>
        <router-outlet />
      </main>
    </div>
    <wp-nova-chat-mount [config]="config" />
  `,
  styles: `
    .nova-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      min-height: 100dvh;
      align-items: stretch;
    }
    main { min-width: 0; }
  `,
})
export class AppComponent {
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
          ? { mode: "sidebar", width: 420 }
          : { mode: "popover" },
    };
  }
}
```

Angular already responds to a new `config` reference. The core reuses its
iframe and conversation while it changes layout or moves to a new mount. See
[Configuration: Presentation](./configuration.md#presentation) for the host
layout contract and responsive fallback.

## Service API

Use `NovaChatService` when registration belongs in a service or feature initializer:

```ts
import { Injectable, inject } from "@angular/core";
import { NovaChatService } from "@wp-nova/chat-sdk-angular";
import { createTicketTool } from "./nova-tools";

@Injectable({ providedIn: "root" })
export class CustomerToolRegistration {
  private readonly nova = inject(NovaChatService);

  register() {
    this.nova.registerTool(createTicketTool);
  }
}
```

The service also exposes `open()`, `close()`, and `toggle()` for host-owned
controls. Disable the SDK launcher in configuration and wire any Angular button:

```ts
provideNovaChat({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  launcher: false,
});
```

```html
<button type="button" (click)="nova.toggle()">Assistant</button>
<wp-nova-chat-mount />
```

Keep `nova` public or delegate through a component method when the template
needs access to it.

The same definition can be passed through the component's `tools` input. See
[Tools and guided workflows](./tools.md) for confirmation, abort, and handler rules.

Filter routes and tools with the signed-in user's permissions. When Angular
Router destinations render async data, connect `wp-nova:navigate` to the router
and dispatch `wp-nova:settled` only after the destination data is ready. See
[Navigation and async pages](./navigation.md).

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
