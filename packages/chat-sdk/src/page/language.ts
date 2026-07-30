import type { PageLanguageSignals } from "../protocol/types/index.js";

const MAX_LOCALE_LENGTH = 100;
const MAX_BROWSER_LOCALES = 10;

/** Canonicalize one BCP 47 locale, rejecting malformed or oversized values. */
export function normalizeLocale(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > MAX_LOCALE_LENGTH) return undefined;

    try {
        return Intl.getCanonicalLocales(trimmed)[0];
    } catch {
        return undefined;
    }
}

/**
 * Capture non-content language hints for the current host page.
 *
 * These are deliberately signals, not a client-side language decision. The
 * workflow model still sees the page content and can distinguish a genuinely
 * monolingual page from mixed UI, transcript, and customer-entered text.
 */
export function capturePageLanguageSignals(hostLocale?: string): PageLanguageSignals | undefined {
    const root = document.documentElement as
        | (Element & { lang?: string; getAttribute?: (name: string) => string | null })
        | undefined;
    const documentLocale = normalizeLocale(
        root?.lang || root?.getAttribute?.("lang") || undefined,
    );
    const normalizedHostLocale = normalizeLocale(hostLocale);

    const rawBrowserLocales =
        typeof navigator === "undefined"
            ? []
            : [
                  ...(Array.isArray(navigator.languages) ? navigator.languages : []),
                  navigator.language,
              ];
    const browserLocales = Array.from(
        new Set(rawBrowserLocales.map(normalizeLocale).filter((value): value is string => !!value)),
    ).slice(0, MAX_BROWSER_LOCALES);

    const signals: PageLanguageSignals = {
        hostLocale: normalizedHostLocale,
        documentLocale,
        browserLocales: browserLocales.length ? browserLocales : undefined,
    };
    return Object.values(signals).some((value) => value !== undefined) ? signals : undefined;
}
