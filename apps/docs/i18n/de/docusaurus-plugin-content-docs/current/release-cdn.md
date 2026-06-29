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

### Dokumentationsversionen und npm-Versionen

Einträge im Dokumentationswähler beschreiben den öffentlichen Integrationsvertrag, nicht jeden npm-Patch. Die `v1.0`-Dokumentation gilt für `@wp-nova/chat-sdk@1.0.x`, `@wp-nova/chat-sdk-react@1.0.x` und `@wp-nova/chat-sdk-angular@1.0.x`.

Patch-Releases auf npm verwenden dieselbe Dokumentationslinie, solange sich die Integrationshinweise nicht ändern. Ein neues Major- oder Minor-Release mit dokumentiertem Verhalten erhält einen neuen Eintrag im Dokumentationswähler.
