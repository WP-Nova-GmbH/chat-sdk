---
id: release-cdn
title: Release & CDN
---

## Release & CDN

The core SDK build emits:

- `dist/index.js` for ESM imports.
- `dist/index.cjs` for CommonJS consumers.
- `dist/index.d.ts` for TypeScript.
- `dist/index.global.js` for the script-tag CDN artifact.
- `dist/index.global.js.sri` for immutable URL integrity metadata.

### Channels

| Channel | URL | Cache | SRI |
| --- | --- | --- | --- |
| Immutable | `https://chat.wp-nova.ai/sdk/<version>/sdk.js` | long-lived | required |
| Rolling | `https://chat.wp-nova.ai/sdk/v1/sdk.js` | no-cache | not available |

The rolling channel is an opt-in convenience. The immutable versioned URL is the default recommendation for production installs.
