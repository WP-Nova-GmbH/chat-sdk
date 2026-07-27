import type { SiteRoute } from "./page.js";

// ---------------------------------------------------------------------------
// SDK init config
// ---------------------------------------------------------------------------

/** Host-page color mode forwarded to the embedded chat UI. */
export type HostTheme = "light" | "dark";

/**
 * How the SDK shell is presented on the host page.
 *
 * Pop-over mode keeps the existing fixed launcher/panel behavior. Sidebar mode
 * participates in the host's grid/flex layout and therefore requires `mount`.
 */
export type ChatPresentation =
    | { mode?: "popover" }
    | {
          mode: "sidebar";
          /** Requested docked width in pixels. Numeric values are clamped to 320–640. */
          width?: number;
      };

/** Public configuration passed to `WpNova('init', config)` / `<wp-nova-chat>`. */
export interface SdkConfig {
    /**
     * Non-secret, SDK-facing surface handle. The ONLY identifier that crosses
     * the browser boundary; used for pre-auth theming and in the tokenEndpoint
     * exchange. (The internal surface id never reaches the browser.)
     */
    publicSurfaceId: string;
    /**
     * The customer's own backend endpoint that mints an embedded-session token.
     * The SDK fetches the token from HERE — never from Nova directly with the
     * integration secret.
     */
    tokenEndpoint: string;
    /**
     * Base URL of the Nova-hosted iframe app. The iframe is mounted at
     * `<baseUrl>/embed/chat`. Defaults to the production chat host.
     */
    baseUrl?: string;
    /**
     * Host DOM element (or selector) to mount into. Defaults to document.body
     * for pop-over mode; required for sidebar mode.
     */
    mount?: string | HTMLElement;
    /**
     * Shell presentation. Defaults to the existing fixed pop-over. Re-running
     * init with a different value updates the existing iframe in place.
     */
    presentation?: ChatPresentation;
    /** Launcher / panel title shown before surface theming arrives. */
    title?: string;
    /** Accent color for the pre-auth launcher shell. */
    accent?: string;
    /**
     * Optional launcher/open-button color for the pre-auth shell. When omitted,
     * the launcher uses `accent`.
     */
    triggerColor?: string;
    /** Light-mode launcher color. Overrides `triggerColor` while `theme` is "light". */
    triggerColorLight?: string;
    /** Dark-mode launcher color. Overrides `triggerColor` while `theme` is "dark". */
    triggerColorDark?: string;
    /** Launcher icon color for the pre-auth shell: "light", "dark", or a hex color. */
    triggerIconColor?: string;
    /**
     * Whether the SDK-owned launcher button is shown. Defaults to true. Set to
     * false when the host page provides its own control and uses the public
     * open/close/toggle API.
     */
    launcher?: boolean;
    /**
     * Host page color mode forwarded to the embedded chat. Defaults to "light".
     * Re-running init with a new value updates the existing iframe in place.
     */
    theme?: HostTheme;
    /**
     * Per-surface safe-value selector allowlist. A field value is captured in
     * the Visible Page Snapshot ONLY when it opts in (via `data-wp-nova-include`
     * or by matching one of these selectors) AND passes every sensitivity check.
     * Default-deny: omit this and no field values are captured unless attributed.
     */
    safeValueSelectors?: string[];
    /**
     * Enables embedded voice mode and delegates microphone permission to the
     * Nova-hosted iframe. Defaults to false, so embeds do not receive microphone
     * eligibility unless the host opts in.
     */
    voiceMode?: boolean;
    /**
     * Declares the host site's navigable routes so the agent can jump straight
     * to a known page ("take me to settings") in a single navigate call instead
     * of hopping through whatever links are currently visible. Only same-origin
     * paths (leading "/") are accepted; entries are carried with every page
     * capture and re-validated server-side. Declare only routes the current
     * user can actually reach — filter by role/permissions before init.
     */
    routes?: SiteRoute[];
    /**
     * Tuning for the post-action DOM settle before snapshot capture.
     * `quietMs` is the mutation-free window that counts as settled (default 200,
     * max 1000); `maxWaitMs` is the hard cap on the wait (default 1600, max
     * 5000) — hitting it flags the snapshot `unsettled`. Hosts can end the wait
     * early by dispatching the `wp-nova:settled` window event once the view
     * triggered by the last action has rendered its data. Set
     * `waitForNavigationSignal` when host-router navigation must not accept a
     * transient mutation-quiet state before route data has loaded; the hard cap
     * remains the fallback and marks the snapshot unsettled.
     */
    settle?: {
        quietMs?: number;
        maxWaitMs?: number;
        waitForNavigationSignal?: boolean;
    };
    /** Protocol version the SDK speaks (defaults to PROTOCOL_VERSION). */
    protocolVersion?: number;
}
