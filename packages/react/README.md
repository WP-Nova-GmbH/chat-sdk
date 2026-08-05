# @wp-nova/chat-sdk-react

React provider and hooks for the Nova Chat SDK.

📖 **Full documentation:** [https://chat.wp-nova.ai](https://chat.wp-nova.ai)

```tsx
import {
    NovaChatProvider,
    useNovaChat,
    useNovaChatOpenState,
    useNovaTool,
} from "@wp-nova/chat-sdk-react";

function AssistantButton() {
    const chat = useNovaChat();
    const open = useNovaChatOpenState();
    return (
        <button aria-expanded={open} onClick={() => void chat.toggle()} type="button">
            {open ? "Close assistant" : "Open assistant"}
        </button>
    );
}

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
                theme: "dark",
                locale: "en-GB",
                triggerColorLight: "#7E54E4",
                triggerColorDark: "#A991F2",
                launcher: false,
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
            }}
        >
            <AssistantButton />
            <Tools />
        </NovaChatProvider>
    );
}
```

Install this package with `@wp-nova/chat-sdk`. Keep config/tool definitions
stable, filter routes/tools with the signed-in user's permissions, and mount the
provider above the route outlet. For async router destinations, connect
`wp-nova:navigate` and dispatch `wp-nova:settled` after required data renders.
Update `config.theme` from the host application's light/dark mode; changing only
that field updates the existing iframe without re-fetching auth or resetting the
conversation.

`useNovaChat().setPageReady(false)` cancels only an unacknowledged matching
workflow while route data loads; an already-started run continues. Call
`setPageReady(true)` after it renders. Keep the provider above the
route outlet. Backend workflow tools are configured server-side and never need a
browser handler. See the [workflow guide](https://chat.wp-nova.ai/page-workflows).

For a docked sidebar, render a stable grid/flex container before the provider
effect runs and configure it as the mount:

```tsx
const config = useMemo(
    () => ({
        ...novaConfig,
        mount: "#nova-layout",
        presentation:
            mode === "sidebar"
                ? ({ mode: "sidebar", width, resizable: true } as const)
                : ({ mode: "popover" } as const),
    }),
    [mode, width],
);
```

Use `grid-template-columns: minmax(0, 1fr) auto` and give the container an
available block size. Changing `mode` re-initializes the singleton in place and
preserves the iframe, auth, tools, open state, and conversation. The core falls
back to pop-over when the container cannot fit the sidebar plus `384px` of main
content. Omit `resizable` for a fixed width. When it is enabled, listen for the
bubbling `wp-nova:sidebar-resize` event and store `event.detail.width` in the
`width` state if the choice should survive later config updates. See the
[presentation documentation](https://chat.wp-nova.ai/configuration#presentation)
for the complete layout and sizing contract.
