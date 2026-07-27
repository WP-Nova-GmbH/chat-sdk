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
