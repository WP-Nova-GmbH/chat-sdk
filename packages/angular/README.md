# @wp-nova/sdk-angular

Angular standalone component and service wrappers for the Nova Chat SDK.

```ts
import { provideNovaChat } from "@wp-nova/sdk-angular";

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

Install this package with `@wp-nova/sdk`.
