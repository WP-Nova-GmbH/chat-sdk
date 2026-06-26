---
id: theming
title: Theming
---

The SDK owns only the launcher and outer panel. The Nova-hosted iframe owns the chat header, history, message composer, and conversation UI.

Surface display settings from Nova are the trusted source of truth after authentication. SDK config values are useful for the pre-auth first paint.

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
  triggerIconColor: "light",
});
```

If `accent` or `triggerColor` is supplied, the launcher can render on-brand immediately. Otherwise, the launcher can wait for trusted surface theme data.

## Launcher Icon Color

`triggerIconColor` accepts:

- `light`
- `dark`
- a hex color such as `#ffffff`

Invalid values are ignored and fall back to a readable default.

## Development Mode Badge

When a surface is in development origin mode, Nova includes `developmentMode: true` in the token response. The SDK marks the launcher so test embeds are visually distinct from production surfaces.

Production surfaces omit that flag.
