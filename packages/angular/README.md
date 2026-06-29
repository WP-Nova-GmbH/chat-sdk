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
        }),
    ],
};
```

```html
<wp-nova-chat-mount [tools]="tools" />
```

Install this package with `@wp-nova/chat-sdk`.
