import { type ApplicationConfig, provideZonelessChangeDetection } from "@angular/core";
import { provideNovaChat } from "@wp-nova/chat-sdk-angular";

// Docs: Angular > Provider Setup. provideNovaChat registers the SDK config during
// bootstrap; the standalone <wp-nova-chat-mount> component then mounts the
// launcher and registers tools. Only browser-safe values belong here — the
// integration secret stays in the server-side token endpoint (vite.config.ts).
export const appConfig: ApplicationConfig = {
    providers: [
        provideZonelessChangeDetection(),
        provideNovaChat({
            publicSurfaceId: import.meta.env.VITE_NOVA_PUBLIC_SURFACE_ID ?? "",
            tokenEndpoint: "/api/nova-token",
            baseUrl: import.meta.env.VITE_NOVA_BASE_URL,
            title: "Switchyard assistant",
            accent: "#0f766e",
            triggerColor: "#0f766e",
            triggerIconColor: "light",
            // Opt these field values into page snapshots; everything else is default-deny.
            safeValueSelectors: ["#dispatch-reference", "[data-agent-readable]"],
        }),
    ],
};
