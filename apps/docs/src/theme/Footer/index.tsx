import Link from "@docusaurus/Link";
import { NovaWordmark } from "../../components/NovaWordmark";

export default function Footer() {
    return (
        <footer className="nova-footer">
            <div className="nova-footer__inner">
                <div className="nova-footer__grid">
                    <div>
                        <NovaWordmark />
                        <p>The assistant you embed and control. Built in Ulm, Germany.</p>
                    </div>
                    <div>
                        <h2>Docs</h2>
                        <Link to="/quickstart">Quickstart</Link>
                        <Link to="/configuration">Configuration</Link>
                        <Link to="/api-reference">API reference</Link>
                    </div>
                    <div>
                        <h2>Packages</h2>
                        <Link to="/api-reference">@wp-nova/sdk</Link>
                        <Link to="/react">@wp-nova/sdk-react</Link>
                        <Link to="/angular">@wp-nova/sdk-angular</Link>
                    </div>
                    <div>
                        <h2>More</h2>
                        <Link to="/security">Security</Link>
                        <Link to="/release-cdn">Release & CDN</Link>
                        <a href="https://wp-nova.com">WP Nova</a>
                    </div>
                </div>
                <div className="nova-footer__bottom">
                    <span>Copyright 2026 WP Nova GmbH · Ulm, DE</span>
                    <span>Built with Docusaurus · nova-chat-sdk v1.0</span>
                </div>
            </div>
        </footer>
    );
}
