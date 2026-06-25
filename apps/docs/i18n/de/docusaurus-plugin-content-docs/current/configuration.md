---
id: configuration
title: Konfiguration
---

## Konfiguration

Alle Optionen werden an `WpNova("init", config)` oder den Helper `init(config)` übergeben.

| Feld | Erforderlich | Beschreibung |
| --- | --- | --- |
| `publicSurfaceId` | ja | Nicht geheimes Surface-Handle für das SDK. |
| `tokenEndpoint` | ja | Kunden-Backend-Endpoint, der ein Embedded-Session-Token ausstellt. |
| `baseUrl` | nein | Basis-URL des Nova-iframes. Standard ist `https://chat.wp-nova.ai`. |
| `mount` | nein | CSS-Selektor oder Element, in das gemountet wird. Standard ist `document.body`. |
| `title` | nein | Launcher- und Panel-Titel vor der Authentifizierung. |
| `accent` | nein | Akzentfarbe vor der Authentifizierung. |
| `triggerColor` | nein | Farbe des Launchers bzw. Öffnen-Buttons. Standard ist `accent`. |
| `triggerIconColor` | nein | `light`, `dark` oder eine Hex-Farbe. |
| `safeValueSelectors` | nein | CSS-Selektoren, die Feldwerte für die Snapshot-Erfassung freigeben. |
| `protocolVersion` | nein | Bridge-Protokoll-Override für Kompatibilitätstests. |

### Standardwerte

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

### Reinitialisierung

Das SDK ist singleton-sicher. Ein erneuter `init`-Aufruf während HMR oder eines Remounts auf Routenebene verwendet das vorhandene Custom Element wieder. Wenn sich `publicSurfaceId`, `baseUrl` oder `protocolVersion` ändern, baut das Element iframe und Bridge neu auf und holt ein frisches Token, bevor es die Authentifizierung postet.
