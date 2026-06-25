import type { Options as ClassicOptions } from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const lightCodeTheme = {
    ...prismThemes.nightOwl,
    plain: {
        ...prismThemes.nightOwl.plain,
        backgroundColor: "#16161F"
    }
};

const darkCodeTheme = {
    ...prismThemes.nightOwl,
    plain: {
        ...prismThemes.nightOwl.plain,
        backgroundColor: "#0D0D18"
    }
};

const config: Config = {
    title: "Nova Chat SDK",
    tagline: "Embed the Nova assistant into any website.",
    favicon: "img/wpnova-wordmark-mono.svg",
    url: "https://chat.wp-nova.ai",
    baseUrl: "/",
    organizationName: "WP-Nova-GmbH",
    projectName: "chat-sdk",
    trailingSlash: false,
    onBrokenLinks: "throw",
    i18n: {
        defaultLocale: "en",
        locales: ["en", "de", "fr"],
        localeConfigs: {
            en: { label: "English" },
            de: { label: "Deutsch" },
            fr: { label: "Francais" }
        }
    },
    markdown: {
        format: "detect",
        hooks: { onBrokenMarkdownLinks: "warn" }
    },
    presets: [
        [
            "classic",
            {
                docs: {
                    routeBasePath: "/",
                    sidebarPath: "./sidebars.ts",
                    breadcrumbs: true,
                    showLastUpdateAuthor: false,
                    showLastUpdateTime: false,
                    editUrl: undefined
                },
                blog: false,
                pages: false,
                theme: {
                    customCss: "./src/css/custom.css"
                }
            } satisfies ClassicOptions
        ]
    ],
    themeConfig: {
        colorMode: {
            defaultMode: "light",
            respectPrefersColorScheme: false
        },
        announcementBar: {
            id: "nova-chat-sdk-v1",
            content:
                'Nova Chat SDK v1.0 is now generally available&nbsp;&nbsp;<a href="/quickstart">Get started -></a>',
            backgroundColor: "#7E54E4",
            textColor: "#FFFFFF",
            isCloseable: true
        },
        docs: {
            sidebar: {
                hideable: true
            }
        },
        navbar: {
            hideOnScroll: false
        },
        prism: {
            theme: lightCodeTheme,
            darkTheme: darkCodeTheme,
            defaultLanguage: "typescript"
        }
    }
};

export default config;
