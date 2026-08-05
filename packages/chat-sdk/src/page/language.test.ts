import assert from "node:assert/strict";
import test from "node:test";
import { capturePageLanguageSignals, normalizeLocale } from "./language.js";

test("normalizes valid BCP 47 locales and rejects malformed values", () => {
    assert.equal(normalizeLocale(" de-de "), "de-DE");
    assert.equal(normalizeLocale("en"), "en");
    assert.equal(normalizeLocale("not_a_locale"), undefined);
    assert.equal(normalizeLocale(""), undefined);
});

test("captures host, document, and deduplicated browser language signals", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
            documentElement: {
                lang: "fr-fr",
                getAttribute: () => "fr-fr",
            },
        },
    });
    Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: {
            language: "de-DE",
            languages: ["de-DE", "en-us", "de-de", "not_a_locale"],
        },
    });

    try {
        assert.deepEqual(capturePageLanguageSignals("it-it"), {
            hostLocale: "it-IT",
            documentLocale: "fr-FR",
            browserLocales: ["de-DE", "en-US"],
        });
    } finally {
        if (originalDocument) {
            Object.defineProperty(globalThis, "document", originalDocument);
        } else {
            Reflect.deleteProperty(globalThis, "document");
        }
        if (originalNavigator) {
            Object.defineProperty(globalThis, "navigator", originalNavigator);
        } else {
            Reflect.deleteProperty(globalThis, "navigator");
        }
    }
});
