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
| `voiceMode` | nein | Aktiviert Spracheingabe und Mikrofon-Delegation an das Nova-iframe. |
| `routes` | nein | Berechtigungsgefilterte Site-Routen als `{ path, description }`. |
| `settle` | nein | Post-Action-Readiness mit `quietMs`, `maxWaitMs` und `waitForNavigationSignal`. |
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

### Site-Routen und asynchrone Navigation

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  routes: [
    { path: "/kunden", description: "Kundenliste mit Suche" },
    {
      path: "/kunden/:customerId",
      description: "Kundendetail; customerId stammt aus /kunden",
    },
  ],
  settle: {
    maxWaitMs: 5000,
    waitForNavigationSignal: true,
  },
});
```

Routen müssen mit genau einem `/` beginnen, werden dedupliziert und auf 100
begrenzt. Pfad und Beschreibung dürfen jeweils höchstens 300 Zeichen lang sein.
Übermittle nur Routen, die der aktuelle Benutzer erreichen darf.

Standardmäßig wartet das SDK nach einer Aktion 200 ms DOM-Ruhe, höchstens 1600
ms. Trifft das Limit, erhält der Snapshot `unsettled: true`. Bei asynchronen
SPA-Routen wartet `waitForNavigationSignal` nach einer vom Host übernommenen
Navigation auf `wp-nova:settled`. Sende das Ereignis erst, wenn Zielroute und
benötigte Daten gerendert sind.

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

Das SDK ist singleton-sicher. Ein erneuter `init`-Aufruf während HMR oder eines Remounts auf Routenebene verwendet das vorhandene Custom Element wieder. Wenn sich `publicSurfaceId`, `baseUrl`, `voiceMode` oder `protocolVersion` ändern, baut das Element iframe und Bridge neu auf und holt ein frisches Token, bevor es die Authentifizierung postet.
