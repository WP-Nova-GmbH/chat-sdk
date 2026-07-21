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

```html
<wp-nova-chat-mount [tools]="tools" />
```

Install this package with `@wp-nova/chat-sdk`.

Pass complete `ToolDefinition[]` values to the mount component or call
`NovaChatService.registerTool(definition)`. Filter routes/tools by permission.
For async Angular Router destinations, dispatch `wp-nova:settled` only after
the destination's required data has rendered.
