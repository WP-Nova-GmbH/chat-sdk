// Config normalization + protocol tunables for the SDK.

import { DEFAULT_SETTLE, type SettleOptions } from "../page/settle.js";
import {
    type HostTheme,
    PROTOCOL_VERSION,
    type SdkConfig,
    type SiteRoute,
} from "../protocol/types/index.js";
import { missingRequiredConfigFields } from "./diagnostics.js";

/** Default base URL of the Nova-hosted iframe app. */
export const DEFAULT_BASE_URL = "https://chat.wp-nova.ai";

/** Default pre-auth launcher title (replaced by surface theming after auth). */
export const DEFAULT_TITLE = "Assistant";

/**
 * Default accent for the pre-auth launcher shell. The Nova brand primary
 * (`var(--primary)` resolved to sRGB) so the out-of-box launcher is on-brand;
 * per-surface theming overrides it via `config.accent` once configured.
 */
export const DEFAULT_ACCENT = "#8665e3";

/** Path the iframe app is mounted at under the base URL. */
export const EMBED_PATH = "/embed/chat";

/**
 * Response timeout (ms) for the client tool / navigation round-trip. The POC
 * used a single 1500 ms timeout for everything; tool / navigation round-trips
 * legitimately run far longer because the agent loop blocks on them. On timeout
 * the bridge emits a `*_ERROR(code="timeout")` frame rather than silently
 * dropping the pending request. Snapshot capture is synchronous (no timeout) —
 * a capture failure surfaces as a `capture_error` frame.
 */
export const TIMEOUTS = {
    /** A client tool / navigation round-trip may await user input or the network. */
    clientTool: 120_000,
    /** Token endpoints should fail visibly instead of leaving the launcher hidden forever. */
    tokenEndpoint: 15_000,
} as const;

/** Resolved, validated config the rest of the SDK consumes. */
export interface ResolvedConfig {
    publicSurfaceId: string;
    tokenEndpoint: string;
    baseUrl: string;
    /** Exact origin of the iframe — outbound postMessages target THIS, never "*". */
    iframeOrigin: string;
    /** Full iframe src (`<baseUrl><EMBED_PATH>?surface=<publicSurfaceId>`). */
    iframeSrc: string;
    mount?: string | HTMLElement;
    title: string;
    accent: string;
    /** Launcher/open-button color; falls back to `accent`. */
    triggerColor: string;
    /** Launcher icon color; supports "light", "dark", or a hex color. */
    triggerIconColor: string;
    /** Host page color mode forwarded to the iframe; defaults to light. */
    theme: HostTheme;
    /** True when the host config supplied a launcher/accent color for first paint. */
    hasFirstPaintLauncherColor: boolean;
    /** Per-surface safe-value selector allowlist (default-deny; empty by default). */
    safeValueSelectors: string[];
    /** Whether the embedded iframe may expose voice mode and request microphone access. */
    voiceModeEnabled: boolean;
    /** Validated integrator-declared site routes attached to every page capture. */
    siteRoutes: SiteRoute[];
    /** Clamped post-action settle tuning for the pre-capture mutation wait. */
    settle: SettleOptions;
    protocolVersion: number;
}

/**
 * Server-side bound on declared routes (g8way drops the excess anyway); warn at
 * resolve time so an oversized manifest is caught in development, not silently
 * truncated in production.
 */
const MAX_SITE_ROUTES = 100;

/**
 * Keep only well-formed routes: a same-origin path (leading "/" but not "//",
 * which the browser would treat as protocol-relative and thus cross-origin)
 * plus a non-empty description, deduped by path. Malformed entries are dropped
 * with a console warning instead of failing init.
 */
function resolveSiteRoutes(routes: SdkConfig["routes"]): SiteRoute[] {
    if (!Array.isArray(routes)) return [];

    const seenPaths = new Set<string>();
    const resolved: SiteRoute[] = [];
    for (const route of routes) {
        const path = typeof route?.path === "string" ? route.path.trim() : "";
        const description = typeof route?.description === "string" ? route.description.trim() : "";
        // URL parsing treats backslashes as slashes for special schemes, so
        // `/\\evil.example/path` is protocol-relative just like `//evil.example/path`.
        const normalizedSeparators = path.replace(/\\/g, "/");
        if (!path.startsWith("/") || normalizedSeparators.startsWith("//") || seenPaths.has(path)) {
            console.warn(`[wp-nova] ignoring invalid or duplicate route ${JSON.stringify(route)}`);
            continue;
        }
        seenPaths.add(path);
        resolved.push({ path, description });
    }
    if (resolved.length > MAX_SITE_ROUTES) {
        console.warn(
            `[wp-nova] config.routes declares ${resolved.length} routes; only the first ${MAX_SITE_ROUTES} are used`,
        );
        return resolved.slice(0, MAX_SITE_ROUTES);
    }
    return resolved;
}

/** Upper bounds on host-supplied settle timings; the defaults sit well below them. */
const SETTLE_QUIET_MS_MAX = 1000;
const SETTLE_MAX_WAIT_MS_MAX = 5000;

/**
 * Clamp host-supplied settle tuning into sane bounds; malformed values fall
 * back to the defaults with a console warning instead of failing init.
 */
function resolveSettle(settle: SdkConfig["settle"]): SettleOptions {
    const resolveMs = (value: unknown, fallback: number, min: number, max: number): number => {
        if (value == null) return fallback;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            console.warn(`[wp-nova] ignoring invalid settle timing ${JSON.stringify(value)}`);
            return fallback;
        }
        return Math.min(Math.max(value, min), max);
    };
    const quietMs = resolveMs(settle?.quietMs, DEFAULT_SETTLE.quietMs, 0, SETTLE_QUIET_MS_MAX);
    const maxWaitMs = resolveMs(
        settle?.maxWaitMs,
        Math.max(DEFAULT_SETTLE.maxWaitMs, quietMs),
        quietMs,
        SETTLE_MAX_WAIT_MS_MAX,
    );
    return {
        quietMs,
        maxWaitMs,
        waitForNavigationSignal: settle?.waitForNavigationSignal === true,
    };
}

/**
 * Validate + normalize a raw `SdkConfig` into a `ResolvedConfig`. Throws on the
 * two non-negotiable fields (`publicSurfaceId`, `tokenEndpoint`) and computes
 * the iframe's exact origin once so the bridge can target it precisely.
 */
export function resolveConfig(config: SdkConfig): ResolvedConfig {
    if (!config || typeof config !== "object") {
        throw new Error("[wp-nova] init requires a config object");
    }
    const missing = missingRequiredConfigFields(config);
    if (missing.includes("publicSurfaceId")) {
        throw new Error("[wp-nova] init requires a `publicSurfaceId`");
    }
    if (missing.includes("tokenEndpoint")) {
        throw new Error("[wp-nova] init requires a `tokenEndpoint`");
    }

    const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    const url = new URL(EMBED_PATH, `${baseUrl}/`);
    url.searchParams.set("surface", config.publicSurfaceId);
    const voiceModeEnabled = config.voiceMode === true;
    if (voiceModeEnabled) {
        url.searchParams.set("voice", "1");
    }
    const triggerColor = config.triggerColor || config.accent || DEFAULT_ACCENT;
    const hasFirstPaintLauncherColor = Boolean(config.triggerColor || config.accent);

    return {
        publicSurfaceId: config.publicSurfaceId,
        tokenEndpoint: config.tokenEndpoint,
        baseUrl,
        iframeOrigin: url.origin,
        iframeSrc: url.toString(),
        mount: config.mount,
        title: config.title || DEFAULT_TITLE,
        accent: config.accent || DEFAULT_ACCENT,
        triggerColor,
        triggerIconColor: config.triggerIconColor || "light",
        theme: config.theme === "dark" ? "dark" : "light",
        hasFirstPaintLauncherColor,
        safeValueSelectors: Array.isArray(config.safeValueSelectors)
            ? config.safeValueSelectors.filter((s) => typeof s === "string" && s.trim())
            : [],
        voiceModeEnabled,
        siteRoutes: resolveSiteRoutes(config.routes),
        settle: resolveSettle(config.settle),
        protocolVersion: config.protocolVersion ?? PROTOCOL_VERSION,
    };
}
