---
id: theming
title: Theming
---

The SDK owns only the launcher and outer panel. The Nova-hosted iframe owns the chat header, history, message composer, and conversation UI.

Surface display settings from Nova are the trusted source of truth after authentication. SDK config values are useful for the pre-auth first paint.

The host page's light/dark mode is a separate input. It controls the iframe's
color mode but does not replace the surface's title, logo, or accent.

Choose the values before implementation:

- visible chat title;
- primary/accent color for the iframe;
- launcher background (often the same as the product primary color);
- launcher icon contrast (`light`, `dark`, or an explicit hex);
- authenticated logo.

Do not confuse the visible title with an internal surface/integration name.

## Surface Display Settings

Configure these in the Embedded Chat Surface:

| Setting | Used by |
| --- | --- |
| Title | Iframe chat header and first-paint display settings. |
| Logo | Iframe chat header after authenticated surface lookup. |
| Accent | Iframe theme and launcher fallback. |
| Trigger color | SDK launcher button. |
| Trigger icon color | SDK launcher icon. |

The token response may include trusted first-paint display settings:

```json
{
  "access_token": "<token>",
  "expires_in": 900,
  "displaySettings": {
    "title": "Support",
    "accent": "#0066CC",
    "triggerColor": "#004EA8",
    "triggerIconColor": "light"
  }
}
```

## Pre-Auth Launcher Theme

Pass SDK config colors when you want the launcher to appear branded before the first token response:

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  accent: "#9A72F8",
  triggerColor: "#7E54E4",
  triggerColorLight: "#7E54E4",
  triggerColorDark: "#A991F2",
  triggerIconColor: "light",
});
```

If `accent`, `triggerColor`, or the active mode's theme-specific color is
supplied, the launcher can render on-brand immediately. Otherwise, the launcher
can wait for trusted surface theme data.

The SDK's fallback accent is Nova purple. Products with a different design
system should pass their actual primary color explicitly—prefer a stable
six-digit hex value rather than copying an unresolved CSS variable. When
`triggerColor` is omitted, it falls back to `accent`.

Use `triggerColorLight` and `triggerColorDark` when the launcher needs different
contrast against each host-page mode. The active mode-specific value overrides
the legacy `triggerColor`; an omitted mode falls back to `triggerColor`, then
`accent`. Existing integrations that only pass `triggerColor` remain unchanged.
Changing `theme` or either mode-specific color updates the current launcher in
place without replacing the iframe or re-fetching auth.

## Launcher Icon Color

`triggerIconColor` accepts:

- `light`
- `dark`
- a hex color such as `#ffffff`

Invalid values are ignored and fall back to a readable default.

## Host Page Light/Dark Mode

Pass the host application's current theme explicitly:

```ts
const chatConfig = {
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
};

function syncChatTheme(theme: "light" | "dark") {
  init({ ...chatConfig, theme });
}
```

Omitting `theme` always selects `light`. The SDK deliberately does not read the
WP Chat theme cookie or guess from `prefers-color-scheme`; your application is
the source of truth. When its theme changes, call `init` again (or update the
React/Angular config value). The SDK sends a `HOST_THEME` frame to the existing
iframe without re-fetching the token endpoint, so the current route and
conversation remain intact. It also updates the panel and iframe background,
theme-matched elevation, and hairline border immediately. This avoids a
contrasting first-paint flash and keeps the panel edge visible against a
same-tone host page while the embedded app applies the frame.

## Development Mode Badge

When a surface is in development origin mode, Nova includes `developmentMode: true` in the token response. The SDK marks the launcher so test embeds are visually distinct from production surfaces.

Production surfaces omit that flag.
