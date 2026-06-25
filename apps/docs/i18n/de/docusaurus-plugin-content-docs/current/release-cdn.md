---
id: release-cdn
title: Versionierung & CDN
---

## Versionierung & CDN

Der Core-SDK-Build erzeugt:

- `dist/index.js` für ESM-Imports.
- `dist/index.cjs` für CommonJS-Nutzer.
- `dist/index.d.ts` für TypeScript.
- `dist/index.global.js` für das Script-Tag-CDN-Artefakt.
- `dist/index.global.js.sri` für Integritätsmetadaten unveränderlicher URLs.

### Kanäle

| Kanal | URL | Cache | SRI |
| --- | --- | --- | --- |
| Unveränderlich | `https://chat.wp-nova.ai/sdk/<version>/sdk.js` | langlebig | erforderlich |
| Rolling | `https://chat.wp-nova.ai/sdk/v1/sdk.js` | no-cache | nicht verfügbar |

Der Rolling Channel ist eine optionale Komfortfunktion. Die unveränderliche versionierte URL ist die Standardempfehlung für Produktionsinstallationen.
