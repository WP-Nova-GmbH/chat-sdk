import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import { NovaWordmark } from "../../components/NovaWordmark";

const footerContent = {
    en: {
        tagline: "The assistant you embed and control. Built in Ulm, Germany.",
        docs: "Docs",
        quickstart: "Quickstart",
        configuration: "Configuration",
        apiReference: "API reference",
        packages: "Packages",
        more: "More",
        security: "Security",
        release: "Release & CDN",
        builtWith: "Built with Docusaurus · nova-chat-sdk v1.0"
    },
    de: {
        tagline: "Der Assistent, den du einbettest und steuerst. Gebaut in Ulm, Deutschland.",
        docs: "Dokumentation",
        quickstart: "Schnellstart",
        configuration: "Konfiguration",
        apiReference: "API-Referenz",
        packages: "Pakete",
        more: "Mehr",
        security: "Sicherheit",
        release: "Versionierung & CDN",
        builtWith: "Gebaut mit Docusaurus · nova-chat-sdk v1.0"
    },
    fr: {
        tagline: "L'assistant que vous intégrez et contrôlez. Conçu à Ulm, en Allemagne.",
        docs: "Documentation",
        quickstart: "Démarrage rapide",
        configuration: "Configuration",
        apiReference: "Référence API",
        packages: "Paquets",
        more: "Plus",
        security: "Sécurité",
        release: "Publication et CDN",
        builtWith: "Construit avec Docusaurus · nova-chat-sdk v1.0"
    }
} satisfies Record<string, Record<string, string>>;

export default function Footer() {
    const { i18n } = useDocusaurusContext();
    const content = footerContent[i18n.currentLocale] ?? footerContent.en;

    return (
        <footer className="nova-footer">
            <div className="nova-footer__inner">
                <div className="nova-footer__grid">
                    <div>
                        <NovaWordmark />
                        <p>{content.tagline}</p>
                    </div>
                    <div>
                        <h2>{content.docs}</h2>
                        <Link to="/quickstart">{content.quickstart}</Link>
                        <Link to="/configuration">{content.configuration}</Link>
                        <Link to="/api-reference">{content.apiReference}</Link>
                    </div>
                    <div>
                        <h2>{content.packages}</h2>
                        <Link to="/api-reference">@wp-nova/sdk</Link>
                        <Link to="/react">@wp-nova/sdk-react</Link>
                        <Link to="/angular">@wp-nova/sdk-angular</Link>
                    </div>
                    <div>
                        <h2>{content.more}</h2>
                        <Link to="/security">{content.security}</Link>
                        <Link to="/release-cdn">{content.release}</Link>
                        <a href="https://wp-nova.com">WP Nova</a>
                    </div>
                </div>
                <div className="nova-footer__bottom">
                    <span>Copyright 2026 WP Nova GmbH · Ulm, DE</span>
                    <span>{content.builtWith}</span>
                </div>
            </div>
        </footer>
    );
}
