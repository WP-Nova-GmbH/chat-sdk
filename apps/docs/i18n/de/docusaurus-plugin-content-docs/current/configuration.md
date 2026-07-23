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
| `triggerColorLight` | nein | Launcher-Farbe im hellen Modus; überschreibt dort `triggerColor`. |
| `triggerColorDark` | nein | Launcher-Farbe im dunklen Modus; überschreibt dort `triggerColor`. |
| `triggerIconColor` | nein | `light`, `dark` oder eine Hex-Farbe. |
| `theme` | nein | Aktueller Modus der Host-Seite: `light` oder `dark`. Standard ist `light`. |
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
  theme: "light",
});
```

Wenn weder `accent` noch `triggerColor` noch die modusspezifische Farbe für den
aktiven Modus gesetzt ist, kann das SDK den Launcher ausblenden, bis
vertrauenswürdige Theme-Daten der Surface eintreffen. Die Launcher-Farbe wird in
dieser Reihenfolge aufgelöst: `triggerColorLight` bzw. `triggerColorDark`,
`triggerColor`, `accent`, Nova-Lila. Nur eine Farbe für den aktiven Modus
ermöglicht den sofortigen ersten Render.

`theme` ist von den Anzeigeeinstellungen der Nova-Surface getrennt. Übergib den
aktuellen Modus der Host-Anwendung ausdrücklich; das SDK liest weder ein
WP-Chat-Cookie noch ermittelt es den Modus selbst. Ein weiterer `init`-Aufruf
mit geändertem `theme` aktualisiert Launcher, Panel und bestehendes iframe,
ohne ein neues Token abzurufen oder die Konversation zurückzusetzen. Dasselbe
gilt bei einer Änderung des Config-Werts in einem Framework-Wrapper.

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

Routen müssen mit genau einem `/` beginnen. Absolute URLs und
protokollrelative Varianten wie `//host/path` oder `/\host/path` werden
verworfen. Routen werden dedupliziert und auf 100 begrenzt; Pfad und
Beschreibung dürfen jeweils höchstens 300 Zeichen lang sein. Übermittle nur
Routen, die der aktuelle Benutzer erreichen darf.

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

Das SDK ist singleton-sicher. Ein erneuter `init`-Aufruf während HMR oder eines
Remounts auf Routenebene verwendet das vorhandene Custom Element wieder. Wenn
sich `publicSurfaceId`, `baseUrl`, `voiceMode` oder `protocolVersion` ändern,
baut das Element iframe und Bridge neu auf und holt ein frisches Token. Ein
geänderter `tokenEndpoint` holt neue Authentifizierungsdaten für das bestehende
iframe. Änderungen an `theme` oder Launcher-Farben werden live angewendet; ein
neues `theme` wird zusätzlich per `HOST_THEME` an das bestehende iframe
gesendet.

### Panel-Lebenszyklus

Beim Öffnen wird der Launcher ausgeblendet und das Panel nutzt den dadurch
freien Platz unten rechts. Minimieren über den iframe-Header blendet das Panel
aus, lässt das iframe aber gemountet und erhält damit Route und Konversation.
Das SDK hält außerdem Pointer-, Maus- und Klick-Events des Launchers in seinem
Shadow Root, damit Outside-Click-Handler der Host-Seite nicht auf dieselbe
Aktivierung reagieren. Dafür ist kein Integrationscode erforderlich.
