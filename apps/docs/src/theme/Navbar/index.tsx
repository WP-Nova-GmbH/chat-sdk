import Link from "@docusaurus/Link";
import { useLocation } from "@docusaurus/router";
import { useColorMode } from "@docusaurus/theme-common";
import { useAlternatePageUtils } from "@docusaurus/theme-common/internal";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { NovaWordmark } from "../../components/NovaWordmark";
import { getSearchIndex } from "../../data/searchIndex";

const localeLabels: Record<string, string> = {
    en: "English",
    de: "Deutsch",
    fr: "Français"
};

const mobileLinksByLocale = {
    en: [
        { label: "Overview", to: "/" },
        { label: "Quickstart", to: "/quickstart" },
        { label: "Configuration", to: "/configuration" },
        { label: "DOM access", to: "/dom-access" },
        { label: "Events", to: "/events" },
        { label: "Theming", to: "/theming" },
        { label: "Security", to: "/security" },
        { label: "API", to: "/api-reference" },
        { label: "React", to: "/react" },
        { label: "Angular", to: "/angular" },
        { label: "Release", to: "/release-cdn" }
    ],
    de: [
        { label: "Übersicht", to: "/" },
        { label: "Schnellstart", to: "/quickstart" },
        { label: "Konfiguration", to: "/configuration" },
        { label: "DOM-Zugriff", to: "/dom-access" },
        { label: "Ereignisse", to: "/events" },
        { label: "Design", to: "/theming" },
        { label: "Sicherheit", to: "/security" },
        { label: "API", to: "/api-reference" },
        { label: "React", to: "/react" },
        { label: "Angular", to: "/angular" },
        { label: "Versionen", to: "/release-cdn" }
    ],
    fr: [
        { label: "Vue d'ensemble", to: "/" },
        { label: "Démarrage", to: "/quickstart" },
        { label: "Configuration", to: "/configuration" },
        { label: "Accès DOM", to: "/dom-access" },
        { label: "Événements", to: "/events" },
        { label: "Apparence", to: "/theming" },
        { label: "Sécurité", to: "/security" },
        { label: "API", to: "/api-reference" },
        { label: "React", to: "/react" },
        { label: "Angular", to: "/angular" },
        { label: "Publication", to: "/release-cdn" }
    ]
} satisfies Record<string, Array<{ label: string; to: string }>>;

const searchLabels: Record<string, { ariaLabel: string; empty: string; placeholder: string }> = {
    en: { ariaLabel: "Search documentation", empty: "No results found", placeholder: "Search" },
    de: { ariaLabel: "Dokumentation durchsuchen", empty: "Keine Ergebnisse gefunden", placeholder: "Suchen" },
    fr: {
        ariaLabel: "Rechercher dans la documentation",
        empty: "Aucun résultat trouvé",
        placeholder: "Rechercher"
    }
};

const navbarLabels = {
    en: {
        docs: "Docs",
        menu: "Menu",
        mobileNav: "Mobile",
        primaryNav: "Primary",
        themeToggle: "Toggle dark mode",
        versionCurrent: "v1.0 latest"
    },
    de: {
        docs: "Dokumentation",
        menu: "Menü",
        mobileNav: "Mobile Navigation",
        primaryNav: "Hauptnavigation",
        themeToggle: "Dunkelmodus umschalten",
        versionCurrent: "v1.0 aktuell"
    },
    fr: {
        docs: "Documentation",
        menu: "Menu",
        mobileNav: "Navigation mobile",
        primaryNav: "Navigation principale",
        themeToggle: "Activer ou désactiver le mode sombre",
        versionCurrent: "v1.0 actuel"
    }
} satisfies Record<string, Record<string, string>>;

function stripBaseUrl(pathname: string, baseUrl: string): string {
    const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const basePath = normalizedBaseUrl.replace(/\/$/, "");

    if (normalizedBaseUrl === "/") return pathname || "/";
    if (pathname === basePath || pathname === normalizedBaseUrl) return "/";
    if (pathname.startsWith(normalizedBaseUrl)) return `/${pathname.slice(normalizedBaseUrl.length)}` || "/";

    return pathname || "/";
}

function normalizeDocsPath(pathname: string): string {
    const withoutTrailingSlash = pathname.replace(/\/$/, "");
    return withoutTrailingSlash || "/";
}

function SearchBox({ locale }: { locale: string }) {
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const normalizedQuery = query.trim().toLowerCase();
    const results = useMemo(() => {
        const entries = getSearchIndex(locale);
        if (!normalizedQuery) return entries.slice(0, 5);
        return entries
            .filter((entry) =>
                [entry.title, entry.section, entry.description].some((value) =>
                    value.toLowerCase().includes(normalizedQuery),
                ),
            )
            .slice(0, 6);
    }, [locale, normalizedQuery]);
    const labels = searchLabels[locale] ?? searchLabels.en;
    const hasEmptySearch = Boolean(normalizedQuery) && results.length === 0;

    useEffect(() => {
        function isEditableTarget(target: EventTarget | null): boolean {
            if (!(target instanceof HTMLElement)) return false;
            const tagName = target.tagName.toLowerCase();

            return (
                tagName === "input" ||
                tagName === "textarea" ||
                tagName === "select" ||
                target.isContentEditable
            );
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (
                event.key !== "/" ||
                event.metaKey ||
                event.ctrlKey ||
                event.altKey ||
                isEditableTarget(event.target)
            ) {
                return;
            }

            event.preventDefault();
            inputRef.current?.focus();
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    return (
        <div className="nova-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
            </svg>
            <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.placeholder}
                aria-label={labels.ariaLabel}
            />
            <kbd>/</kbd>
            <div className="nova-search__panel">
                {hasEmptySearch ? (
                    <p className="nova-search__empty">{labels.empty}</p>
                ) : (
                    results.map((entry) => (
                        <Link className="nova-search__item" key={entry.href} to={entry.href}>
                            <span>{entry.section}</span>
                            <strong>{entry.title}</strong>
                            <small>{entry.description}</small>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}

export default function Navbar() {
    const { i18n } = useDocusaurusContext();
    const location = useLocation();
    const alternatePageUtils = useAlternatePageUtils();
    const { colorMode, setColorMode } = useColorMode();
    const [menuOpen, setMenuOpen] = useState(false);
    const currentLocale = i18n.currentLocale;
    const currentLocaleBaseUrl = i18n.localeConfigs[currentLocale]?.baseUrl ?? "/";
    const currentDocsPath = normalizeDocsPath(stripBaseUrl(location.pathname, currentLocaleBaseUrl));
    const mobileLinks = mobileLinksByLocale[currentLocale] ?? mobileLinksByLocale.en;
    const labels = navbarLabels[currentLocale] ?? navbarLabels.en;
    const getLocaleHref = (locale: string) =>
        `${alternatePageUtils.createUrl({ locale, fullyQualified: false })}${location.search}${location.hash}`;
    const activeApi = location.pathname.includes("api-reference");

    return (
        <header className="navbar nova-navbar">
            <button
                className={clsx("nova-navbar__burger", menuOpen && "nova-navbar__burger--open")}
                type="button"
                aria-label={labels.menu}
                aria-controls="nova-mobile-menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
            </button>
            <Link className="nova-navbar__brand" to="/">
                <NovaWordmark />
                <span>Chat SDK</span>
            </Link>
            <nav className="nova-navbar__links" aria-label={labels.primaryNav}>
                <Link className="nova-navbar__link nova-navbar__link--active" to="/">
                    {labels.docs}
                </Link>
                <Link
                    className={clsx("nova-navbar__link", activeApi && "nova-navbar__link--active")}
                    to="/api-reference"
                >
                    API
                </Link>
            </nav>
            <div className="nova-navbar__spacer" />
            <SearchBox locale={currentLocale} />
            <div className="nova-dropdown">
                <button className="nova-dropdown__button" type="button">
                    v1.0
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </button>
                <div className="nova-dropdown__menu">
                    <span className="nova-dropdown__item nova-dropdown__item--active">
                        {labels.versionCurrent}
                    </span>
                </div>
            </div>
            <div className="nova-dropdown">
                <button className="nova-dropdown__button" type="button">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                    </svg>
                    {localeLabels[currentLocale] ?? "English"}
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </button>
                <div className="nova-dropdown__menu">
                    {i18n.locales.map((locale) => (
                        <a
                            className={clsx(
                                "nova-dropdown__item",
                                locale === currentLocale && "nova-dropdown__item--active",
                            )}
                            href={getLocaleHref(locale)}
                            key={locale}
                        >
                            {localeLabels[locale] ?? locale}
                        </a>
                    ))}
                </div>
            </div>
            <button
                className="nova-theme-toggle"
                type="button"
                aria-label={labels.themeToggle}
                title={labels.themeToggle}
                onClick={() => setColorMode(colorMode === "dark" ? "light" : "dark")}
            >
                <span className="nova-theme-toggle__sun">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                    </svg>
                </span>
                <span className="nova-theme-toggle__moon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                </span>
            </button>
            <div
                className={clsx("nova-mobile-menu", menuOpen && "nova-mobile-menu--open")}
                id="nova-mobile-menu"
            >
                <nav className="nova-mobile-menu__links" aria-label={labels.mobileNav}>
                    {mobileLinks.map((link) => (
                        <Link
                            className={clsx(
                                "nova-mobile-menu__link",
                                currentDocsPath === link.to && "nova-mobile-menu__link--active",
                            )}
                            key={link.to}
                            to={link.to}
                            onClick={() => setMenuOpen(false)}
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>
                <div className="nova-mobile-menu__meta">
                    {i18n.locales.map((locale) => (
                        <a
                            className={clsx(
                                "nova-mobile-menu__chip",
                                locale === currentLocale && "nova-mobile-menu__chip--active",
                            )}
                            href={getLocaleHref(locale)}
                            key={locale}
                            onClick={() => setMenuOpen(false)}
                        >
                            {localeLabels[locale] ?? locale}
                        </a>
                    ))}
                </div>
            </div>
        </header>
    );
}
