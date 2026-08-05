# @wp-nova/chat-sdk-angular

Angular standalone component and service wrappers for the Nova Chat SDK.

📖 **Full documentation:** [https://chat.wp-nova.ai](https://chat.wp-nova.ai)

```ts
import { provideNovaChat } from "@wp-nova/chat-sdk-angular";

export const appConfig = {
    providers: [
        provideNovaChat({
            publicSurfaceId: "surf_...",
            tokenEndpoint: "/api/nova/embed-token",
            launcher: false,
            locale: "en-GB",
            routes: [
                { path: "/customers", description: "Customer lookup list with search." },
            ],
            pageWorkflows: [
                {
                    id: "customer-brief",
                    path: "/customers/:customerId",
                    execution: { mode: "research-and-compose" },
                    prompt: "Summarize the loaded customer with cited evidence.",
                },
            ],
            settle: {
                maxWaitMs: 5000,
                waitForNavigationSignal: true,
            },
        }),
    ],
};
```

```ts
import { inject } from "@angular/core";
import { NovaChatService } from "@wp-nova/chat-sdk-angular";

export class AppComponent {
    readonly nova = inject(NovaChatService);
}
```

```html
<button type="button" (click)="nova.toggle()">Assistant</button>
<wp-nova-chat-mount [tools]="tools" />
```

Install this package with `@wp-nova/chat-sdk`.

Pass complete `ToolDefinition[]` values to the mount component or call
`NovaChatService.registerTool(definition)`. Filter routes/tools by permission.
`NovaChatService` also exposes `open()`, `close()`, and `toggle()` for
host-owned controls; omit `launcher: false` to keep the default SDK button.
For async Angular Router destinations, dispatch `wp-nova:settled` only after
the destination's required data has rendered.

Call `nova.setPageReady(false)` while a matching route loads and
`nova.setPageReady(true)` after it renders. Backend workflow tools run on the
server and do not need a browser handler. See the
[workflow guide](https://chat.wp-nova.ai/page-workflows).

For a docked sidebar, place a stable grid/flex container before
`<wp-nova-chat-mount>` and bind a new config reference when the mode changes:

```ts
config: SdkConfig = {
    publicSurfaceId: "surf_...",
    tokenEndpoint: "/api/nova/embed-token",
    mount: "#nova-layout",
    presentation: { mode: "sidebar", width: 420, resizable: true },
};
```

Use `grid-template-columns: minmax(0, 1fr) auto` and give the container an
available block size. Angular passes the updated config through `init()` while
the core preserves the iframe, auth, tools, open state, and conversation. The
core falls back to pop-over when the container cannot fit the sidebar plus
`384px` of main content. Omit `resizable` for a fixed width. When it is enabled,
listen for the bubbling `wp-nova:sidebar-resize` event and store
`event.detail.width` in a new config reference if the choice should persist. See the
[presentation documentation](https://chat.wp-nova.ai/configuration#presentation)
for the complete layout and sizing contract.
