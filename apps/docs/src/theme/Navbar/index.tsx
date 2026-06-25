import Link from "@docusaurus/Link";
import { useLocation } from "@docusaurus/router";
import { useColorMode } from "@docusaurus/theme-common";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import clsx from "clsx";
import { useMemo, useState } from "react";
import { NovaWordmark } from "../../components/NovaWordmark";
import { searchIndex } from "../../data/searchIndex";

const localeLabels: Record<string, string> = {
    en: "English",
    de: "Deutsch",
    fr: "Francais"
};

const mobileLinks = [
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
];

function stripLocalePrefix(pathname: string): string {
    return pathname.replace(/^\/(de|fr)(?=\/|$)/, "") || "/";
}

function localeHref(pathname: string, locale: string): string {
    const withoutLocale = stripLocalePrefix(pathname);
    if (locale === "en") return withoutLocale;
    return withoutLocale === "/" ? `/${locale}/` : `/${locale}${withoutLocale}`;
}

function SearchBox() {
    const [query, setQuery] = useState("");
    const results = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return searchIndex.slice(0, 5);
        return searchIndex
            .filter((entry) =>
                [entry.title, entry.section, entry.description].some((value) =>
                    value.toLowerCase().includes(normalized),
                ),
            )
            .slice(0, 6);
    }, [query]);

    return (
        <div className="nova-search">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
            </svg>
            <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search documentation"
            />
            <kbd>/</kbd>
            <div className="nova-search__panel">
                {results.map((entry) => (
                    <Link className="nova-search__item" key={entry.href} to={entry.href}>
                        <span>{entry.section}</span>
                        <strong>{entry.title}</strong>
                        <small>{entry.description}</small>
                    </Link>
                ))}
            </div>
        </div>
    );
}

export default function Navbar() {
    const { i18n } = useDocusaurusContext();
    const location = useLocation();
    const { colorMode, setColorMode } = useColorMode();
    const [menuOpen, setMenuOpen] = useState(false);
    const currentLocale = i18n.currentLocale;
    const currentDocsPath = stripLocalePrefix(location.pathname);
    const activeApi = location.pathname.includes("api-reference");

    return (
        <header className="navbar nova-navbar">
            <button
                className="nova-navbar__burger"
                type="button"
                aria-label="Menu"
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
            <nav className="nova-navbar__links" aria-label="Primary">
                <Link className="nova-navbar__link nova-navbar__link--active" to="/">
                    Docs
                </Link>
                <Link
                    className={clsx("nova-navbar__link", activeApi && "nova-navbar__link--active")}
                    to="/api-reference"
                >
                    API
                </Link>
            </nav>
            <div className="nova-navbar__spacer" />
            <SearchBox />
            <div className="nova-dropdown">
                <button className="nova-dropdown__button" type="button">
                    v1.0
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </button>
                <div className="nova-dropdown__menu">
                    <span className="nova-dropdown__item nova-dropdown__item--active">v1.0 latest</span>
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
                            href={localeHref(location.pathname, locale)}
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
                aria-label="Toggle dark mode"
                title="Toggle dark mode"
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
                <nav className="nova-mobile-menu__links" aria-label="Mobile">
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
                            href={localeHref(location.pathname, locale)}
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
