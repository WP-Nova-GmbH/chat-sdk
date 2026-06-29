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
        hasFirstPaintLauncherColor,
        safeValueSelectors: Array.isArray(config.safeValueSelectors)
            ? config.safeValueSelectors.filter((s) => typeof s === "string" && s.trim())
            : [],
        voiceModeEnabled,
        protocolVersion: config.protocolVersion ?? PROTOCOL_VERSION,
    };
}
