---
id: configuration
title: Configuration
---

## Configuration

All options are passed to `WpNova("init", config)` or the `init(config)` helper.

| Field | Required | Description |
| --- | --- | --- |
| `publicSurfaceId` | yes | Non-secret SDK-facing surface handle. |
| `tokenEndpoint` | yes | Customer backend endpoint that mints an embedded-session token. |
| `baseUrl` | no | Nova iframe base URL. Defaults to `https://chat.wp-nova.ai`. |
| `mount` | no | CSS selector or element to mount into. Defaults to `document.body`. |
| `title` | no | Pre-auth launcher and panel title. |
| `accent` | no | Pre-auth accent color. |
| `triggerColor` | no | Launcher/open-button color. Defaults to `accent`. |
| `triggerIconColor` | no | `light`, `dark`, or a hex color. |
| `safeValueSelectors` | no | CSS selectors that opt field values into snapshot capture. |
| `voiceMode` | no | Enables the embedded voice button and delegates microphone access to the Nova iframe. Defaults to `false`. |
| `protocolVersion` | no | Bridge protocol override for compatibility testing. |

### Defaults

```ts
init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
  baseUrl: "https://chat.wp-nova.ai",
  title: "Assistant",
  accent: "#8665e3",
  triggerIconColor: "light",
});
```

### Re-initialization

The SDK is singleton-safe. Re-running `init` during HMR or a route-level remount reuses the existing custom element. If `publicSurfaceId`, `baseUrl`, or `protocolVersion` changes, the element rebuilds the iframe/bridge and fetches a fresh token before posting auth.
