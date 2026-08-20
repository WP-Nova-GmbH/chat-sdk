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
| `mount` | nur Sidebar | CSS-Selektor oder `HTMLElement` für das Mounting. Pop-over verwendet standardmäßig `document.body`; die Sidebar erfordert einen expliziten Layout-Container. |
| `presentation` | nein | `{ mode: "popover" }` (Standard) oder `{ mode: "sidebar", width?: number, resizable?: boolean }`. |
| `title` | nein | Launcher- und Panel-Titel vor der Authentifizierung. |
| `accent` | nein | Akzentfarbe vor der Authentifizierung. |
| `triggerColor` | nein | Farbe des Launchers bzw. Öffnen-Buttons. Standard ist `accent`. |
| `triggerColorLight` | nein | Launcher-Farbe im hellen Modus; überschreibt dort `triggerColor`. |
| `triggerColorDark` | nein | Launcher-Farbe im dunklen Modus; überschreibt dort `triggerColor`. |
| `triggerIconColor` | nein | `light`, `dark` oder eine Hex-Farbe. |
| `launcher` | nein | Zeigt den SDK-eigenen Launcher. Standard ist `true`; für einen Host-Button auf `false` setzen. |
| `theme` | nein | Aktueller Modus der Host-Seite: `light` oder `dark`. Standard ist `light`. |
| `ui` | nein | Welches Chat-Design das iframe rendert: `classic` (Standard) oder `current`. Siehe [Chat-Design](#chat-design). |
| `locale` | nein | Expliziter BCP-47-Sprachhinweis des Hosts im Seitenkontext für automatische Workflows; die Surface steuert weiterhin die iframe-Lokalisierung. |
| `safeValueSelectors` | nein | CSS-Selektoren, die Feldwerte für die Snapshot-Erfassung freigeben. |
| `voiceMode` | nein | Aktiviert Spracheingabe und Mikrofon-Delegation an das Nova-iframe. |
| `routes` | nein | Berechtigungsgefilterte Site-Routen als `{ path, description }`. |
| `pageWorkflows` | nein | Exakte `research-and-compose`-Workflows für passende Seiten. |
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
  launcher: true,
  presentation: { mode: "popover" },
  theme: "light",
  ui: "classic",
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


### Chat-Design

Der Chat im iframe existiert in zwei Designs. `ui` wählt eines davon:

```ts
init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
  ui: "current",
});
```

| Wert | Was gerendert wird |
| --- | --- |
| `current` | Das überarbeitete Panel, für das `384px`-Popover und die angedockte Sidebar gleichermaßen ausgelegt: kompakter 52px-Header, Begrüßung in der Display-Schrift des Produkts, zweistufige Berechtigungskarte und ein Composer im Maßstab einer schmalen Spalte. Der leere Zustand scrollt, statt abzuschneiden, wenn Begrüßung, Berechtigungskarte und Vorschlagsfragen nicht zusammen hineinpassen. |
| `classic` (Standard) | Das Design, das jedes bestehende Embed heute zeigt: 60px-Header mit 48px-Aktionen, Markenkachel über der Begrüßung, getönte Berechtigungskarte und größere Antwortschrift. |

Beide Designs zeigen dieselbe Konversation, dasselbe Berechtigungsmodell und
dieselben Tools. Es unterscheidet sich nur die Darstellung — was der Assistent
auf deiner Seite sehen und tun darf, ändert sich nicht.

#### Warum `classic` der Standard ist

Jedes bisher veröffentlichte SDK — 1.1.0 und älter — kennt diese Option nicht und
kann sie nicht senden. Ein Embed ohne `ui` muss deshalb das Design behalten, für
das die Host-Seite gebaut wurde: ein Nova-Deploy darf eine laufende Integration
niemals umstylen, die das nie angefordert hat. Auch ein SDK-Update allein ändert
nichts — auf das neue Design wechselt man mit `ui: "current"`, sobald die eigene
Oberfläche dafür bereit ist.

Neue Arbeit fließt in `current`; `classic` ist die Kompatibilitätsposition, kein
zweites gepflegtes Design.

#### Die Wahl gilt ab dem Mount

Das Design wird beim Bau der iframe-URL festgelegt, nicht zur Laufzeit
ausgehandelt. Ein weiterer `init`-Aufruf mit geändertem `ui` ändert die
iframe-`src`, baut damit iframe und Bridge neu auf und holt ein frisches Token —
derselbe Weg wie bei `publicSurfaceId` oder `baseUrl`. **Eine offene
Konversation überlebt diesen Neuaufbau nicht.** Setze `ui` deshalb einmal aus
deiner Konfiguration oder deinem Feature-Flag, bevor das Panel geöffnet wird.

Alles außer einem exakten `"current"` fällt auf `classic` zurück; ein Tippfehler,
ein älteres SDK oder eine veraltete iframe-`src` kann Nutzer also nie auf ein
Design umschalten, das niemand gewählt hat.

### Darstellung

Die Standarddarstellung `popover` behält das feste Panel mit `384px × 640px`
und wird bei Viewport-Breiten bis `480px` bildschirmfüllend. `sidebar` dockt
dasselbe iframe als Spalte in einem Layout der Host-Seite an:

```html
<div id="nova-layout">
  <main><!-- Anwendungsinhalt --></main>
</div>

<style>
  #nova-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 100dvh;
    align-items: stretch;
  }
  #nova-layout > main {
    min-width: 0;
  }
</style>
```

```ts
let mode: "popover" | "sidebar" = "sidebar";

function applyPresentation() {
  init({
    publicSurfaceId: "surf_...",
    tokenEndpoint: "/api/nova-token",
    mount: "#nova-layout",
    presentation:
      mode === "sidebar"
        ? { mode: "sidebar", width: 420, resizable: true }
        : { mode: "popover" },
  });
}

applyPresentation();
mode = "popover";
applyPresentation();
```

Die Spalte heftet sich selbst an den Viewport (`position: sticky`, `100dvh`).
Der Chat bleibt damit vollständig sichtbar, während der Seiteninhalt daneben
scrollt; eine eigene Höhe muss nicht gesetzt werden. Soll die Spalte einen
fixierten Header freilassen, setze `--wpn-sidebar-offset` auf dessen Höhe:

```css
#nova-layout > wp-nova-chat {
  --wpn-sidebar-offset: 64px;
}
```

Ein Mount-Element mit eigener definierter Höhe — etwa eine App-Shell mit eigenen
Scroll-Bereichen — behält diese; die Spalte wächst nie über ihren Mount hinaus.

Die Sidebar-Breite ist standardmäßig `384px`. Endliche Zahlen werden auf
`320–640px` begrenzt; ungültige Laufzeitwerte erzeugen eine Warnung und
verwenden `384px`. Position und Reihenfolge der Spalten, verfügbare Blockhöhe,
Sticky-/Header-Offsets und Animationen gehören vollständig der Host-Seite.

Die Sidebar-Breite ist standardmäßig fest. `resizable: true` fügt an ihrer
Inline-Startkante einen barrierefreien Separator hinzu. Er unterstützt
Pointer-Ziehen, Links-/Rechts-Pfeil in `16px`-Schritten, Pos1 für `320px` und
Ende für die größte Breite, die der aktuelle Container erlaubt. Dabei bleiben
die Grenzen `320–640px` und `384px` Platz für den Hauptinhalt erhalten.

Nach Abschluss eines Pointer-Ziehens und nach jeder unterstützten
Tastaturänderung sendet der Separator das bubbling und composed Event
`wp-nova:sidebar-resize` mit `{ width: number }` in `detail`. Das SDK wendet
die Breite sofort an, ohne das iframe zu ersetzen. Speichere den Wert und
übergib ihn bei späteren `init()`-Aufrufen wieder als `presentation.width`,
wenn die Benutzerauswahl erhalten bleiben soll.

Das SDK beobachtet die verfügbare Breite des Mount-Containers. Es dockt nur,
wenn neben der konfigurierten Sidebar noch `384px` für den Hauptinhalt
verfügbar sind. Die Standardbreite fällt daher unter `768px` auf Pop-over
zurück und dockt automatisch wieder an, sobald genügend Platz vorhanden ist.

Rufe `init()` erneut auf, um Modus, Breite oder Mount-Ziel zu ändern. Das SDK
verschiebt und formatiert sein vorhandenes Custom Element und erhält iframe,
Bridge, Token, registrierte Tools, Öffnungszustand und Konversation. Für
`sidebar` ist ein expliziter, auflösbarer `mount` erforderlich; andernfalls
wird ein aussagekräftiger Fehler ausgelöst.

Öffnen und Schließen sind keine Darstellungsoptionen. Verwende den integrierten
Launcher oder `open()`, `close()` und `toggle()`. Beim Schließen einer
angedockten Sidebar fällt die Layout-Spalte auf Breite null zusammen.
`launcher: false` ermöglicht dieselbe Steuerung über einen eigenen Host-Button.

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

Für Readiness, Backend-Tools, erforderliche Evidenz und Quellen siehe
[Automatische Seiten-Workflows](./page-workflows.md).

### Reinitialisierung

Das SDK ist singleton-sicher. Ein erneuter `init`-Aufruf während HMR oder eines
Remounts auf Routenebene verwendet das vorhandene Custom Element wieder. Wenn
sich `publicSurfaceId`, `baseUrl`, `voiceMode`, `ui` oder `protocolVersion`
ändern,
baut das Element iframe und Bridge neu auf und holt ein frisches Token. Ein
geänderter `tokenEndpoint` holt neue Authentifizierungsdaten für das bestehende
iframe. Änderungen an `theme` oder Launcher-Farben werden live angewendet; ein
neues `theme` wird zusätzlich per `HOST_THEME` an das bestehende iframe
gesendet. Änderungen an `presentation` oder `mount` gestalten beziehungsweise
verschieben das vorhandene Element, ohne iframe oder Authentifizierung
zurückzusetzen.

### Panel-Lebenszyklus

Beim Öffnen wird der Launcher ausgeblendet und das Panel nutzt den dadurch
freien Platz unten rechts. Minimieren über den iframe-Header blendet das Panel
aus, lässt das iframe aber gemountet und erhält damit Route und Konversation.
Das SDK hält außerdem Pointer-, Maus- und Klick-Events des Launchers in seinem
Shadow Root, damit Outside-Click-Handler der Host-Seite nicht auf dieselbe
Aktivierung reagieren.

Für einen eigenen Host-Button setze `launcher: false` und rufe `open()`,
`close()` oder `toggle()` auf. Eine Live-Änderung von `launcher` ersetzt das
iframe nicht. `subscribeOpenChange()` oder `wp-nova:open-change` hält den
eigenen Button synchron, wenn das iframe sich selbst minimiert.
