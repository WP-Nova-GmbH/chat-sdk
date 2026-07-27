# @wp-nova/chat-sdk-angular

Angular standalone component and service wrappers for the Nova Chat SDK.

📖 **Full documentation:** [https://wp-nova.ai/chat-sdk](https://wp-nova.ai/chat-sdk)

```ts
import { provideNovaChat } from "@wp-nova/chat-sdk-angular";

export const appConfig = {
    providers: [
        provideNovaChat({
            publicSurfaceId: "surf_...",
            tokenEndpoint: "/api/nova/embed-token",
            launcher: false,
            routes: [
                { path: "/customers", description: "Customer lookup list with search." },
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

For a docked sidebar, place a stable grid/flex container before
`<wp-nova-chat-mount>` and bind a new config reference when the mode changes:

```ts
config: SdkConfig = {
    publicSurfaceId: "surf_...",
    tokenEndpoint: "/api/nova/embed-token",
    mount: "#nova-layout",
    presentation: { mode: "sidebar", width: 420 },
};
```

Use `grid-template-columns: minmax(0, 1fr) auto` and give the container an
available block size. Angular passes the updated config through `init()` while
the core preserves the iframe, auth, tools, open state, and conversation. The
core falls back to pop-over when the container cannot fit the sidebar plus
`384px` of main content. See the
[presentation documentation](https://chat.wp-nova.ai/configuration#presentation)
for the complete layout and sizing contract.
