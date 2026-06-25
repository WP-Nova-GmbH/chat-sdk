---
id: theming
title: Theming
---

## Theming

The SDK owns only the launcher and outer panel. The iframe owns the chat header and conversation UI, using trusted surface display settings after authentication.

```ts
init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
  accent: "#9A72F8",
  triggerColor: "#7E54E4",
  triggerIconColor: "light",
});
```

### First Paint

If `accent` or `triggerColor` is supplied, the launcher can render on-brand before the first token response. Otherwise, the launcher stays hidden until trusted surface theme data arrives from the iframe.

### Launcher Icon Color

`triggerIconColor` accepts `light`, `dark`, or a hex color. Invalid values are ignored and fall back to a readable default.
