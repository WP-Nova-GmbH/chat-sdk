// Token acquisition from the customer's tokenEndpoint.
//
// The SDK fetches the embedded-session token from the CUSTOMER's backend
// (`tokenEndpoint`), never from Nova directly — the integration secret never
// reaches the browser. The customer endpoint proxies `POST /embed/session` and
// passes through BOTH outcomes:
//   - resolved user   → { access_token, expires_in }       → kind: "granted"
//   - unmatched email  → { unavailable, email, message }     → kind: "unavailable"
// A non-2xx / network / malformed response is a DISTINCT typed transport error
// (kind: "error") so the iframe can render it differently from the legitimate
// unavailable-user state. A persistently-unavailable email must not tight-loop,
// so failures get bounded retry + backoff + a cooldown.

import { type ResolvedConfig, TIMEOUTS } from "./config.js";
import type { SurfaceDisplaySettings, TokenEndpointResponse, TokenResult } from "./types.js";

/** Max attempts per token acquisition (initial + retries). */
const MAX_ATTEMPTS = 3;
/** Base backoff between retries (ms); doubled each attempt. */
const BACKOFF_BASE_MS = 500;
/** Cooldown after exhausting retries so a hard failure can't tight-loop. */
const COOLDOWN_MS = 30_000;

let cooldownUntil = 0;

export function __resetTokenCooldownForTests(): void {
    cooldownUntil = 0;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTimeoutSignal(ms: number): { signal?: AbortSignal; cleanup: () => void } {
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        return { signal: AbortSignal.timeout(ms), cleanup: () => undefined };
    }
    if (typeof AbortController === "undefined") {
        return { cleanup: () => undefined };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return {
        signal: controller.signal,
        cleanup: () => clearTimeout(timer),
    };
}

function tokenErrorMessage(err: unknown): string {
    if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
        return `token endpoint timed out after ${TIMEOUTS.tokenEndpoint}ms`;
    }
    return err instanceof Error ? err.message : String(err);
}

/**
 * Fetch a token from the customer's tokenEndpoint, returning a typed outcome.
 * The endpoint receives the `publicSurfaceId` + the host origin so it can scope
 * the `POST /embed/session` call; the customer backend supplies the user's email
 * from its own authenticated session (never trusted from the browser).
 */
export async function fetchToken(config: ResolvedConfig): Promise<TokenResult> {
    const now = Date.now();
    if (now < cooldownUntil) {
        return {
            kind: "error",
            message: "token endpoint is in cooldown after repeated failures",
        };
    }

    let lastError = "token endpoint unreachable";
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (attempt > 0) await delay(BACKOFF_BASE_MS * 2 ** (attempt - 1));
        const timeout = createTimeoutSignal(TIMEOUTS.tokenEndpoint);
        try {
            const response = await fetch(config.tokenEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                signal: timeout.signal,
                body: JSON.stringify({
                    publicSurfaceId: config.publicSurfaceId,
                    origin: location.origin,
                }),
            });

            if (!response.ok) {
                // A 4xx is unlikely to recover on retry; a 5xx might. Either way
                // it's a transport error, distinct from the unavailable state.
                lastError = `token endpoint returned ${response.status}`;
                if (response.status >= 400 && response.status < 500) break;
                continue;
            }

            const body = (await response.json()) as TokenEndpointResponse;
            const parsed = interpret(body);
            // An unavailable user is a terminal, non-retryable outcome.
            return parsed;
        } catch (err) {
            lastError = tokenErrorMessage(err);
        } finally {
            timeout.cleanup();
        }
    }

    cooldownUntil = Date.now() + COOLDOWN_MS;
    return { kind: "error", message: lastError };
}

function readDisplaySettings(body: TokenEndpointResponse): SurfaceDisplaySettings | null {
    const value =
        (body as { displaySettings?: unknown; display_settings?: unknown }).displaySettings ??
        (body as { display_settings?: unknown }).display_settings;
    if (!value || typeof value !== "object") {
        return null;
    }

    const raw = value as Record<string, unknown>;
    const displaySettings: SurfaceDisplaySettings = {};
    for (const key of ["title", "logo", "accent", "triggerColor", "triggerIconColor"] as const) {
        const candidate = raw[key];
        if (typeof candidate === "string" && candidate.trim()) {
            displaySettings[key] = candidate.trim();
        }
    }

    return Object.keys(displaySettings).length > 0 ? displaySettings : null;
}

/** Map a well-formed tokenEndpoint body onto the typed `TokenResult`. */
function interpret(body: TokenEndpointResponse): TokenResult {
    if (body && body.unavailable === true) {
        return {
            kind: "unavailable",
            email: body.email,
            message: body.message,
        };
    }
    if (body && typeof body.access_token === "string" && body.access_token) {
        return {
            kind: "granted",
            token: body.access_token,
            expiresIn: typeof body.expires_in === "number" ? body.expires_in : 0,
            displaySettings: readDisplaySettings(body),
        };
    }
    return {
        kind: "error",
        message: "token endpoint returned an unrecognized response",
    };
}
