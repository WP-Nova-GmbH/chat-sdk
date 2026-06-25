import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
    sdkSidebar: [
        {
            type: "category",
            label: "Getting started",
            collapsible: true,
            collapsed: false,
            items: ["overview", "quickstart"]
        },
        {
            type: "category",
            label: "Guides",
            collapsible: true,
            collapsed: false,
            items: ["configuration", "dom-access", "events", "theming"]
        },
        {
            type: "category",
            label: "Reference",
            collapsible: true,
            collapsed: false,
            items: ["security", "api-reference", "react", "angular", "release-cdn"]
        }
    ]
};

export default sidebars;
