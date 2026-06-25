export interface SearchEntry {
    title: string;
    href: string;
    section: string;
    description: string;
}

const searchIndexByLocale: Record<string, SearchEntry[]> = {
    en: [
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
    ],
    de: [
        {
            title: "Übersicht",
            href: "/",
            section: "Einstieg",
            description: "Wie das SDK das von Nova gehostete iframe mountet und Seitenkontext bridged."
        },
        {
            title: "Schnellstart",
            href: "/quickstart",
            section: "Einstieg",
            description: "Per Script-Tag oder npm installieren und WpNova initialisieren."
        },
        {
            title: "Konfiguration",
            href: "/configuration",
            section: "Anleitungen",
            description: "SdkConfig-Felder wie publicSurfaceId, tokenEndpoint, baseUrl und Theming."
        },
        {
            title: "Dem Agenten DOM-Zugriff geben",
            href: "/dom-access",
            section: "Anleitungen",
            description: "Tool-Handler registrieren und sichere Seiten-Snapshots bereitstellen."
        },
        {
            title: "Ereignisse",
            href: "/events",
            section: "Anleitungen",
            description: "Bridge-Lifecycle, Token-Erneuerung, READY, AUTH_EXPIRED und Tool-Frames."
        },
        {
            title: "Design-Anpassung",
            href: "/theming",
            section: "Anleitungen",
            description: "Launcher-Farben, Trigger-Icons, erster Render und Surface-Anzeigeeinstellungen."
        },
        {
            title: "Sicherheit und Berechtigungen",
            href: "/security",
            section: "Referenz",
            description: "Token-Endpoint-Pflichten, Origin-Prüfungen, Feldwerte-Policy und CSP-Hinweise."
        },
        {
            title: "API-Referenz",
            href: "/api-reference",
            section: "Referenz",
            description: "WpNova-Befehle, Helper, SdkConfig und ToolHandler-Typen."
        },
        {
            title: "React",
            href: "/react",
            section: "Referenz",
            description: "@wp-nova/sdk-react in React-18- und React-19-Anwendungen verwenden."
        },
        {
            title: "Angular",
            href: "/angular",
            section: "Referenz",
            description: "@wp-nova/sdk-angular Services, Provider und Standalone-Komponente verwenden."
        },
        {
            title: "Versionierung und CDN",
            href: "/release-cdn",
            section: "Referenz",
            description: "Build-Artefakte, SRI, unveränderliche URLs und der Rolling-v1-Channel."
        }
    ],
    fr: [
        {
            title: "Vue d'ensemble",
            href: "/",
            section: "Premiers pas",
            description: "Comment le SDK monte l'iframe hébergée par Nova et bridge le contexte de page."
        },
        {
            title: "Démarrage rapide",
            href: "/quickstart",
            section: "Premiers pas",
            description: "Installer par balise script ou npm et initialiser WpNova."
        },
        {
            title: "Configuration",
            href: "/configuration",
            section: "Guides",
            description: "Champs SdkConfig, dont publicSurfaceId, tokenEndpoint, baseUrl et theming."
        },
        {
            title: "Donner à l'agent l'accès au DOM",
            href: "/dom-access",
            section: "Guides",
            description: "Enregistrer des handlers d'outils et exposer des instantanés sûrs."
        },
        {
            title: "Événements",
            href: "/events",
            section: "Guides",
            description: "Cycle de vie du bridge, renouvellement de token, READY, AUTH_EXPIRED et frames d'outils."
        },
        {
            title: "Personnalisation visuelle",
            href: "/theming",
            section: "Guides",
            description: "Couleurs du lanceur, icônes de déclenchement, premier rendu et affichage de surface."
        },
        {
            title: "Sécurité et permissions",
            href: "/security",
            section: "Référence",
            description: "Responsabilités de l'endpoint de token, contrôles d'origine, valeurs de champs et CSP."
        },
        {
            title: "Référence API",
            href: "/api-reference",
            section: "Référence",
            description: "Commandes WpNova, helpers, SdkConfig et types ToolHandler."
        },
        {
            title: "React",
            href: "/react",
            section: "Référence",
            description: "Utiliser @wp-nova/sdk-react dans les applications React 18 et 19."
        },
        {
            title: "Angular",
            href: "/angular",
            section: "Référence",
            description: "Utiliser les services, providers et le composant standalone @wp-nova/sdk-angular."
        },
        {
            title: "Publication et CDN",
            href: "/release-cdn",
            section: "Référence",
            description: "Artefacts de build, SRI, URL immuables et canal rolling v1."
        }
    ]
};

export function getSearchIndex(locale: string): SearchEntry[] {
    return searchIndexByLocale[locale] ?? searchIndexByLocale.en;
}
