# @wp-nova/chat-sdk-react

React provider and hooks for the Nova Chat SDK.

📖 **Full documentation:** [https://wp-nova.ai/chat-sdk](https://wp-nova.ai/chat-sdk)

```tsx
import { NovaChatProvider, useNovaTool } from "@wp-nova/chat-sdk-react";

function Tools() {
    useNovaTool({
        name: "create_ticket",
        description: "Creates a support ticket for the visible customer context.",
        inputSchema: {
            type: "object",
            properties: { title: { type: "string" } },
            required: ["title"],
        },
        mutating: true,
        confirmationCopy: "Create this ticket?",
        handler: async (args, { signal } = {}) =>
            crm.createTicket({ title: String(args.title ?? "") }, { signal }),
    });
    return null;
}

export function App() {
    return (
        <NovaChatProvider
            config={{
                publicSurfaceId: "surf_...",
                tokenEndpoint: "/api/nova/embed-token",
                routes: [
                    { path: "/customers", description: "Customer lookup list with search." },
                ],
                settle: {
                    maxWaitMs: 5000,
                    waitForNavigationSignal: true,
                },
            }}
        >
            <Tools />
        </NovaChatProvider>
    );
}
```

Install this package with `@wp-nova/chat-sdk`. Keep config/tool definitions
stable, filter routes/tools with the signed-in user's permissions, and mount the
provider above the route outlet. For async router destinations, connect
`wp-nova:navigate` and dispatch `wp-nova:settled` after required data renders.
