import { describe, expect, it } from "vitest";
import { addLocaleBaseUrl, getLocalizedDocsPath, normalizeDocsPath, stripBaseUrl } from "./localePaths";

describe("locale path helpers", () => {
    it("strips the current locale base from docs paths", () => {
        expect(stripBaseUrl("/quickstart/", "/")).toBe("/quickstart/");
        expect(stripBaseUrl("/de/quickstart/", "/de/")).toBe("/quickstart/");
        expect(stripBaseUrl("/docs/de/quickstart/", "/docs/de/")).toBe("/quickstart/");
    });

    it("adds target locale bases with trailing slashes", () => {
        expect(addLocaleBaseUrl("/", "/de/")).toBe("/de/");
        expect(addLocaleBaseUrl("/quickstart", "/de/")).toBe("/de/quickstart/");
        expect(addLocaleBaseUrl("/quickstart/", "/docs/de/")).toBe("/docs/de/quickstart/");
    });

    it("normalizes active link comparisons without dropping the root path", () => {
        expect(normalizeDocsPath("/")).toBe("/");
        expect(normalizeDocsPath("/quickstart/")).toBe("/quickstart");
    });

    it("builds localized docs paths from canonical Docusaurus paths", () => {
        expect(
            getLocalizedDocsPath({
                currentLocaleBaseUrl: "/",
                pathname: "/quickstart/",
                targetLocaleBaseUrl: "/de/",
            }),
        ).toBe("/de/quickstart/");

        expect(
            getLocalizedDocsPath({
                currentLocaleBaseUrl: "/de/",
                pathname: "/de/quickstart/",
                targetLocaleBaseUrl: "/",
            }),
        ).toBe("/quickstart/");
    });
});
