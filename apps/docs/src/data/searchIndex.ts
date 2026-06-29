export interface SearchEntry {
    title: string;
    docId: string;
    section: string;
    description: string;
}

const searchIndexByLocale: Record<string, SearchEntry[]> = {
    en: [
        {
            title: "Overview",
            docId: "overview",
            section: "Getting started",
            description: "How the SDK mounts the Nova-hosted iframe and bridges page context.",
        },
        {
            title: "Quickstart",
            docId: "quickstart",
            section: "Getting started",
            description:
                "End-to-end surface setup, backend token endpoint, SDK install, tools, and smoke tests.",
        },
        {
            title: "Configuration",
            docId: "configuration",
            section: "Guides",
            description:
                "SdkConfig fields, token endpoint request shape, lifecycle, and destroy behavior.",
        },
        {
            title: "Giving the agent DOM access",
            docId: "dom-access",
            section: "Guides",
            description:
                "Visible Page Snapshots, safe field values, built-in page actions, and page tools.",
        },
        {
            title: "Events",
            docId: "events",
            section: "Guides",
            description:
                "Bridge lifecycle, token refresh, unavailable users, auth errors, and tool frames.",
        },
        {
            title: "Theming",
            docId: "theming",
            section: "Guides",
            description:
                "Launcher colors, trigger icons, first paint, and surface display settings.",
        },
        {
            title: "Security and permissions",
            docId: "security",
            section: "Reference",
            description:
                "Backend trust boundary, origin checks, user resolution, tool permissions, and CSP.",
        },
        {
            title: "API reference",
            docId: "api-reference",
            section: "Reference",
            description: "WpNova commands, helpers, SdkConfig, and ToolHandler types.",
        },
        {
            title: "React",
            docId: "react",
            section: "Reference",
            description: "Use @wp-nova/chat-sdk-react in React 18 and 19 applications.",
        },
        {
            title: "Angular",
            docId: "angular",
            section: "Reference",
            description: "Use @wp-nova/chat-sdk-angular services, providers, and standalone component.",
        },
        {
            title: "Release and CDN",
            docId: "release-cdn",
            section: "Reference",
            description: "Build artifacts, SRI, immutable URLs, and the rolling v1 channel.",
        },
    ],
    de: [
        {
            title: "Übersicht",
            docId: "overview",
            section: "Einstieg",
            description:
                "Wie das SDK das von Nova gehostete iframe mountet und Seitenkontext bridged.",
        },
        {
            title: "Schnellstart",
            docId: "quickstart",
            section: "Einstieg",
            description: "Per Script-Tag oder npm installieren und WpNova initialisieren.",
        },
        {
            title: "Konfiguration",
            docId: "configuration",
            section: "Anleitungen",
            description:
                "SdkConfig-Felder wie publicSurfaceId, tokenEndpoint, baseUrl und Theming.",
        },
        {
            title: "Dem Agenten DOM-Zugriff geben",
            docId: "dom-access",
            section: "Anleitungen",
            description: "Tool-Handler registrieren und sichere Seiten-Snapshots bereitstellen.",
        },
        {
            title: "Ereignisse",
            docId: "events",
            section: "Anleitungen",
            description: "Bridge-Lifecycle, Token-Erneuerung, READY, AUTH_EXPIRED und Tool-Frames.",
        },
        {
            title: "Design-Anpassung",
            docId: "theming",
            section: "Anleitungen",
            description:
                "Launcher-Farben, Trigger-Icons, erster Render und Surface-Anzeigeeinstellungen.",
        },
        {
            title: "Sicherheit und Berechtigungen",
            docId: "security",
            section: "Referenz",
            description:
                "Token-Endpoint-Pflichten, Origin-Prüfungen, Feldwerte-Policy und CSP-Hinweise.",
        },
        {
            title: "API-Referenz",
            docId: "api-reference",
            section: "Referenz",
            description: "WpNova-Befehle, Helper, SdkConfig und ToolHandler-Typen.",
        },
        {
            title: "React",
            docId: "react",
            section: "Referenz",
            description: "@wp-nova/chat-sdk-react in React-18- und React-19-Anwendungen verwenden.",
        },
        {
            title: "Angular",
            docId: "angular",
            section: "Referenz",
            description:
                "@wp-nova/chat-sdk-angular Services, Provider und Standalone-Komponente verwenden.",
        },
        {
            title: "Versionierung und CDN",
            docId: "release-cdn",
            section: "Referenz",
            description: "Build-Artefakte, SRI, unveränderliche URLs und der Rolling-v1-Channel.",
        },
    ],
    fr: [
        {
            title: "Vue d'ensemble",
            docId: "overview",
            section: "Premiers pas",
            description:
                "Comment le SDK monte l'iframe hébergée par Nova et bridge le contexte de page.",
        },
        {
            title: "Démarrage rapide",
            docId: "quickstart",
            section: "Premiers pas",
            description: "Installer par balise script ou npm et initialiser WpNova.",
        },
        {
            title: "Configuration",
            docId: "configuration",
            section: "Guides",
            description:
                "Champs SdkConfig, dont publicSurfaceId, tokenEndpoint, baseUrl et theming.",
        },
        {
            title: "Donner à l'agent l'accès au DOM",
            docId: "dom-access",
            section: "Guides",
            description: "Enregistrer des handlers d'outils et exposer des instantanés sûrs.",
        },
        {
            title: "Événements",
            docId: "events",
            section: "Guides",
            description:
                "Cycle de vie du bridge, renouvellement de token, READY, AUTH_EXPIRED et frames d'outils.",
        },
        {
            title: "Personnalisation visuelle",
            docId: "theming",
            section: "Guides",
            description:
                "Couleurs du lanceur, icônes de déclenchement, premier rendu et affichage de surface.",
        },
        {
            title: "Sécurité et permissions",
            docId: "security",
            section: "Référence",
            description:
                "Responsabilités de l'endpoint de token, contrôles d'origine, valeurs de champs et CSP.",
        },
        {
            title: "Référence API",
            docId: "api-reference",
            section: "Référence",
            description: "Commandes WpNova, helpers, SdkConfig et types ToolHandler.",
        },
        {
            title: "React",
            docId: "react",
            section: "Référence",
            description: "Utiliser @wp-nova/chat-sdk-react dans les applications React 18 et 19.",
        },
        {
            title: "Angular",
            docId: "angular",
            section: "Référence",
            description:
                "Utiliser les services, providers et le composant standalone @wp-nova/chat-sdk-angular.",
        },
        {
            title: "Publication et CDN",
            docId: "release-cdn",
            section: "Référence",
            description: "Artefacts de build, SRI, URL immuables et canal rolling v1.",
        },
    ],
};

export function getSearchIndex(locale: string): SearchEntry[] {
    return searchIndexByLocale[locale] ?? searchIndexByLocale.en;
}
