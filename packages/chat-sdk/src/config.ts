// Config normalization + protocol tunables for the SDK.

import { missingRequiredConfigFields } from "./diagnostics.js";
import { PROTOCOL_VERSION, type SdkConfig } from "./types.js";

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

/**
 * How the embedded session is authenticated.
 *   - `"host"`: the host page mints tokens via its `tokenEndpoint` (the default).
 *   - `"none"`: login-only surface — no `tokenEndpoint`; the iframe drives an
 *     in-widget login and the SDK never acquires a host token (WP-104).
 */
export type AuthMode = "host" | "none";

/** Resolved, validated config the rest of the SDK consumes. */
export interface ResolvedConfig {
    publicSurfaceId: string;
    /** The host token endpoint, or "" when `authMode` is "none" (login-only). */
    tokenEndpoint: string;
    /** Derived auth mode: host-minted tokens vs. login-only (no tokenEndpoint). */
    authMode: AuthMode;
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
    /** True when the host config supplied a launcher/accent color for first paint. */
    hasFirstPaintLauncherColor: boolean;
    /** Per-surface safe-value selector allowlist (default-deny; empty by default). */
    safeValueSelectors: string[];
    /** Whether the embedded iframe may expose voice mode and request microphone access. */
    voiceModeEnabled: boolean;
    protocolVersion: number;
}

/**
 * Validate + normalize a raw `SdkConfig` into a `ResolvedConfig`. Throws on the
 * one non-negotiable field (`publicSurfaceId`) and computes the iframe's exact
 * origin once so the bridge can target it precisely.
 *
 * `tokenEndpoint` is optional: omitting it entirely resolves to a login-only
 * surface (`authMode: "none"`), where the iframe drives an in-widget login and
 * the SDK never mints a host token. An explicitly EMPTY-STRING `tokenEndpoint`
 * is rejected as a typo — the caller must omit the field to opt into login-only.
 */
export function resolveConfig(config: SdkConfig): ResolvedConfig {
    if (!config || typeof config !== "object") {
        throw new Error("[wp-nova] init requires a config object");
    }
    const missing = missingRequiredConfigFields(config);
    if (missing.includes("publicSurfaceId")) {
        throw new Error("[wp-nova] init requires a `publicSurfaceId`");
    }
    // Distinguish a deliberate omission (login-only) from a typo: a present but
    // blank `tokenEndpoint` is almost always a mistake, so reject it rather than
    // silently dropping the host into login-only mode.
    const tokenEndpointProvided = config.tokenEndpoint !== undefined;
    if (tokenEndpointProvided && !config.tokenEndpoint?.trim()) {
        throw new Error(
            "[wp-nova] `tokenEndpoint` must be a non-empty string; omit it entirely for a login-only surface",
        );
    }
    const authMode: AuthMode = tokenEndpointProvided ? "host" : "none";
    const tokenEndpoint = tokenEndpointProvided ? (config.tokenEndpoint as string) : "";

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
        tokenEndpoint,
        authMode,
        baseUrl,
        iframeOrigin: url.origin,
        iframeSrc: url.toString(),
        mount: config.mount,
        title: config.title || DEFAULT_TITLE,
        accent: config.accent || DEFAULT_ACCENT,
        triggerColor,
        triggerIconColor: config.triggerIconColor || "light",
        hasFirstPaintLauncherColor,
        safeValueSelectors: Array.isArray(config.safeValueSelectors)
            ? config.safeValueSelectors.filter((s) => typeof s === "string" && s.trim())
            : [],
        voiceModeEnabled,
        protocolVersion: config.protocolVersion ?? PROTOCOL_VERSION,
    };
}
