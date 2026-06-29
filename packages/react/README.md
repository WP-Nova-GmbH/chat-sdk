# @wp-nova/chat-sdk-react

React provider and hooks for the Nova Chat SDK.

📖 **Full documentation:** [https://wp-nova.ai/chat-sdk](https://wp-nova.ai/chat-sdk)

```tsx
import { NovaChatProvider, useNovaTool } from "@wp-nova/chat-sdk-react";

function Tools() {
    useNovaTool("create_ticket", async (args) => crm.createTicket(args));
    return null;
}

export function App() {
    return (
        <NovaChatProvider
            config={{
                publicSurfaceId: "surf_...",
                tokenEndpoint: "/api/nova/embed-token",
            }}
        >
            <Tools />
        </NovaChatProvider>
    );
}
```

Install this package with `@wp-nova/chat-sdk`.
