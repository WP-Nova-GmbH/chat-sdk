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

### Antwort für nicht verfügbare Benutzer

Der Token-Endpoint muss auch die vollständige Antwort für nicht zugeordnete
Benutzer weitergeben:

```json
{
  "unavailable": true,
  "email": "person@example.com",
  "message": "Es wurde kein Nova-Konto gefunden.",
  "message_is_custom": false,
  "access_request_token": "<zweckgebundene Berechtigung>",
  "access_request_expires_in": 3600
}
```

Nova verwendet `message_is_custom: false` für die lokalisierbare integrierte
Nachricht und `true` für von Administratoren verfassten Surface-Text.

### Reinitialisierung

Das SDK ist singleton-sicher. Ein erneuter `init`-Aufruf während HMR oder eines Remounts auf Routenebene verwendet das vorhandene Custom Element wieder. Wenn sich `publicSurfaceId`, `baseUrl` oder `protocolVersion` ändern, baut das Element iframe und Bridge neu auf und holt ein frisches Token, bevor es die Authentifizierung postet.
