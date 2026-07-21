import type { SurfaceDisplaySettings } from "./tools.js";

// ---------------------------------------------------------------------------
// tokenEndpoint contract (customer backend → SDK)
// ---------------------------------------------------------------------------

/**
 * The customer's `tokenEndpoint` proxies `POST /embed/session` and MUST pass
 * through BOTH outcomes so AC4 (unavailable user) works without a token:
 *   - resolved user  → { access_token, expires_in }
 *   - unmatched email → { unavailable: true, email, message }
 */
export type TokenEndpointResponse = TokenGrantResponse | UnavailableUserResponse;

/** Resolved-user outcome: a short-lived embedded-session token. */
export interface TokenGrantResponse {
    /** The embedded-session Bearer token. */
    access_token: string;
    /** Token lifetime in seconds (drives proactive re-mint at ~80%). */
    expires_in: number;
    /** Trusted first-paint surface display settings from Nova, if passed through. */
    displaySettings?: SurfaceDisplaySettings | null;
    /**
     * True when the surface is in development origin mode. The SDK marks the
     * launcher with a development badge so test embeds are unmistakable. Absent
     * (treated as false) for production surfaces.
     */
    developmentMode?: boolean;
    unavailable?: false;
}

/** Unmatched-email outcome: render the unavailable-user state, no token. */
export interface UnavailableUserResponse {
    unavailable: true;
    /** The email the platform backend asserted (echoed for the UI). */
    email: string;
    /** Message rendered from the surface's unavailableUserMessageTemplate. */
    message: string;
    /** Whether message came from an administrator-authored surface template. */
    message_is_custom?: boolean;
    /** Purpose-scoped access-request capability passed through from Nova. */
    access_request_token?: string;
    /** Capability lifetime in seconds. */
    access_request_expires_in?: number;
    access_token?: undefined;
}

/**
 * Typed token-acquisition outcome surfaced internally by the SDK. Distinguishes
 * a transport/network failure from the legitimate unavailable-user state so the
 * iframe can render them differently.
 */
export type TokenResult =
    | {
          kind: "granted";
          token: string;
          expiresIn: number;
          displaySettings?: SurfaceDisplaySettings | null;
          /** True when the surface is in development origin mode (badge the launcher). */
          developmentMode?: boolean;
      }
    | {
          kind: "unavailable";
          email: string;
          message: string;
          messageIsCustom?: boolean;
          accessRequestToken?: string;
          accessRequestExpiresIn?: number;
      }
    | { kind: "error"; message: string };
