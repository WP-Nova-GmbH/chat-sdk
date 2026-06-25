export interface SearchEntry {
    title: string;
    href: string;
    section: string;
    description: string;
}

export const searchIndex: SearchEntry[] = [
    {
        title: "Overview",
        href: "/",
        section: "Getting started",
        description: "How the SDK mounts the Nova-hosted iframe and bridges page context."
    },
    {
        title: "Quickstart",
        href: "/quickstart",
        section: "Getting started",
        description: "Install by script tag or npm and initialize WpNova."
    },
    {
        title: "Configuration",
        href: "/configuration",
        section: "Guides",
        description: "SdkConfig fields including publicSurfaceId, tokenEndpoint, baseUrl, and theming."
    },
    {
        title: "Giving the agent DOM access",
        href: "/dom-access",
        section: "Guides",
        description: "Register tool handlers and expose safe page snapshots."
    },
    {
        title: "Events",
        href: "/events",
        section: "Guides",
        description: "Bridge lifecycle, token refresh, READY, AUTH_EXPIRED, and tool frames."
    },
    {
        title: "Theming",
        href: "/theming",
        section: "Guides",
        description: "Launcher colors, trigger icons, first paint, and surface display settings."
    },
    {
        title: "Security and permissions",
        href: "/security",
        section: "Reference",
        description: "Token endpoint responsibilities, origin checks, field-value policy, and CSP guidance."
    },
    {
        title: "API reference",
        href: "/api-reference",
        section: "Reference",
        description: "WpNova commands, helpers, SdkConfig, and ToolHandler types."
    },
    {
        title: "React",
        href: "/react",
        section: "Reference",
        description: "Use @wp-nova/sdk-react in React 18 and 19 applications."
    },
    {
        title: "Angular",
        href: "/angular",
        section: "Reference",
        description: "Use @wp-nova/sdk-angular services, providers, and standalone component."
    },
    {
        title: "Release and CDN",
        href: "/release-cdn",
        section: "Reference",
        description: "Build artifacts, SRI, immutable URLs, and the rolling v1 channel."
    }
];
