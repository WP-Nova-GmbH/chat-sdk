import { NovaChatProvider, useNovaTool } from "@wp-nova/sdk-react";

function CustomerTools() {
    useNovaTool(
        "show_toast",
        async (args) => {
            return { ok: true, message: String(args.message ?? "Hello from Nova") };
        },
    );

    return null;
}

export function App() {
    return (
        <NovaChatProvider
            config={{
                publicSurfaceId: "srf_live_replace_me",
                tokenEndpoint: "/api/nova-token",
            }}
        >
            <CustomerTools />
            <main>
                <h1>Nova Chat SDK React Example</h1>
            </main>
        </NovaChatProvider>
    );
}
