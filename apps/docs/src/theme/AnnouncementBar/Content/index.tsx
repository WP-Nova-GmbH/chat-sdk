import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import clsx from "clsx";
import type { HTMLAttributes } from "react";
import styles from "./styles.module.css";

const announcementContent = {
    en: {
        message: "Nova Chat SDK v1.0 is now generally available",
        cta: "Get started ->"
    },
    de: {
        message: "Nova Chat SDK v1.0 ist jetzt allgemein verfügbar",
        cta: "Loslegen ->"
    },
    fr: {
        message: "Nova Chat SDK v1.0 est maintenant disponible",
        cta: "Démarrer ->"
    }
} satisfies Record<string, { cta: string; message: string }>;

export default function AnnouncementBarContent(props: HTMLAttributes<HTMLDivElement>) {
    const { i18n } = useDocusaurusContext();
    const content = announcementContent[i18n.currentLocale] ?? announcementContent.en;

    return (
        <div {...props} className={clsx(styles.content, props.className)}>
            {content.message}&nbsp;&nbsp;
            <Link to="/quickstart">{content.cta}</Link>
        </div>
    );
}
