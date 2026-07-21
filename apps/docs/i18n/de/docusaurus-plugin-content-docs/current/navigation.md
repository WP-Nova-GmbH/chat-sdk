---
id: navigation
title: Navigation und asynchrone Seiten
---

Das SDK kann über sichtbare Links oder ein vom Host deklariertes Routenmanifest navigieren. Nach einer Seitenaktion wartet es, bevor es den nächsten Snapshot erfasst, damit der Agent das Ziel sieht und nicht den gerade verlassenen Bildschirm.

## Site-Topologie deklarieren

Ohne `routes` kennt der Agent nur Links, die im aktuellen Snapshot sichtbar sind. Deklariere nützliche Routen, damit er ein bekanntes Ziel direkt aufrufen kann.

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  routes: [
    { path: "/customers", description: "Customer lookup list with search." },
    {
      path: "/customers/:customerId",
      description: "Customer detail; obtain customerId from /customers or list_customers.",
    },
    { path: "/settings/profile", description: "Signed-in user's profile settings." },
  ],
});
```

Regeln für Routen:

- Pfade sind Same-Origin und beginnen mit genau einem `/`; `//host/path` und absolute URLs werden abgelehnt.
- Doppelte Pfade werden entfernt und höchstens 100 Einträge übernommen.
- Halte jeden Pfad und jede Beschreibung innerhalb der Nova-Grenze von 300 Zeichen.
- Verwende in Mustern `:param`-Platzhalter. Trage niemals erfundene IDs in den Pfad ein.
- Die Beschreibung nennt die Quelle einer realen ID. Der Agent öffnet eine Indexroute, anstatt eine ID zu erfinden.
- Beschreibe den benutzerbezogenen Zweck und keine verborgenen Anweisungen.
- Deklariere nur Routen, die der aktuelle Benutzer erreichen kann. Filtere nach Mandant, Rolle, Modul, Feature und Ressourcenberechtigungen.
- Initialisiere neu, wenn sich die Menge erreichbarer Routen ändert.
- Routen stehen Nova nur zur Verfügung, wenn Page Reading auf der Surface aktiviert ist.

Erstelle das Manifest nach Möglichkeit aus zentralen Routenkonstanten. Eine manuell kopierte Routenliste gerät bei Router-Änderungen aus dem Takt; ergänze für wichtige Routen einen Paritätstest.

## Semantische URLs und Bedienelemente bevorzugen

Nova bevorzugt ein erfasstes `href` oder eine deklarierte Route, weil beides DOM-Neurenderings übersteht. Verwende echte Links für die Navigation und echte beschriftete Buttons für Aktionen.

Ein Framework-Event auf einem nicht interaktiven Container kann für einen Menschen verwendbar, im Seiten-Snapshot aber unsichtbar sein. Ein React-`onClick` auf einer Tabellenzeile ist beispielsweise kein semantisches Bedienelement. Ergänze einen beschrifteten Link oder Button, der dieselbe Aktion ausführt und für assistive Technologien zugänglich bleibt.

## Einen SPA-Router anbinden

Bevor das SDK eine Same-Origin-URL ändert, sendet es ein abbrechbares `wp-nova:navigate`-Event. Fange es einmal in der Nähe des persistenten App-Roots ab:

```ts
window.addEventListener("wp-nova:navigate", (event) => {
  const url = (event as CustomEvent<{ url: string }>).detail.url;
  const destination = new URL(url, window.location.href);
  if (destination.origin !== window.location.origin) return;

  event.preventDefault();
  router.navigate(`${destination.pathname}${destination.search}${destination.hash}`);
});
```

Rufe `preventDefault()` nur auf, wenn der Router die Navigation annimmt. Andernfalls fällt das SDK auf die normale Dokumentnavigation zurück.

Behalte vollständigen Pfad, Query und Hash bei. Verfolge das exakt angeforderte Ziel, damit ein unabhängiger Routenwechsel die ausstehende Nova-Aktion nicht fälschlich abschließen kann.

## Settling nach Aktionen verstehen

Ab SDK 1.0.3 wartet das SDK nach Aktionen und Tools auf ein Zeitfenster ohne Mutationen, bevor es den nächsten Snapshot erfasst.

- `quietMs` ist das erforderliche Zeitfenster ohne DOM-Mutationen. Standardwert `200`; begrenzt auf `0–1000`.
- `maxWaitMs` ist die harte Obergrenze. Standardwert `1600`; begrenzt auf einen Wert zwischen `quietMs` und `5000`.
- Wird die Obergrenze erreicht, enthält der Snapshot `unsettled: true`. Nova kann `refresh_context` aufrufen, bevor es die Aktion als fehlgeschlagen einstuft.
- Gewöhnliche Snapshot-Anfragen aufgrund von Benutzernachrichten werden sofort ausgeführt; die Settle-Wartezeit gilt für die erneute Erfassung nach Aktionen.
- Der Host kann während einer ausstehenden Wartezeit `wp-nova:settled` senden, um sie vorzeitig abzuschließen.

DOM-Ruhe genügt für synchrone Seiten und viele einfache clientseitige Aktionen. Sie ist jedoch kein verlässliches Signal für einen Router, der zunächst eine Shell rendert, kurzzeitig ruhig ist und anschließend asynchrone Daten anzeigt.

## Explizites Signal für asynchrone Routen verlangen

SDK 1.0.4 ergänzt einen Bereitschaftsmodus für die Host-Navigation:

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  settle: {
    quietMs: 1000,
    maxWaitMs: 5000,
    waitForNavigationSignal: true,
  },
});
```

Wenn der Host `wp-nova:navigate` abbricht, ignoriert das SDK vorübergehende DOM-Ruhe und wartet auf `wp-nova:settled`. Vollständige Dokumentnavigation und gewöhnliche Tool-Ergebnisse verwenden weiterhin das normale Settling. Geht vor Erreichen der Obergrenze kein Signal ein, erfasst das SDK einen Snapshot und markiert das Ergebnis als noch nicht vollständig gesetzt, statt die Tool-Schleife dauerhaft zu blockieren.

Sende das Event erst, nachdem:

1. der Router-Pfad dem angeforderten Ziel entspricht;
2. die Zielkomponente committed wurde;
3. erforderliche Routendaten geladen wurden oder ihren vorgesehenen Fehler-/Leerzustand erreicht haben;
4. die gerenderte Ansicht für ein kurzes, durchgängiges Zeitfenster bereit geblieben ist.

```ts
function signalNovaReady() {
  window.dispatchEvent(new CustomEvent("wp-nova:settled"));
}
```

Das SDK lauscht nur, solange ein Settling nach einer Navigation aussteht. Signale, die bereits beim Auslösen der Navigation oder außerhalb dieses Zeitfensters gesendet werden, werden ignoriert. Verwende keine einzelne globale Prüfung auf „nirgendwo laufende Requests“, wenn unabhängiges Polling sie dauerhaft beschäftigt halten kann; bevorzuge die routenspezifische Bereitschaft von Loadern und Queries.

### React Router mit Daten-Queries

Ein robuster Adapter hält das ausstehende Ziel in einer Ref, wartet, bis `useLocation()` diesem Ziel entspricht, und beobachtet anschließend nur die für das Ziel erforderlichen Queries. Sind sie bereit, lass den finalen Render committen und sende dann `wp-nova:settled`. Räume Polling und Listener beim Unmounten sowie dann auf, wenn eine neue Nova-Navigation die vorherige ersetzt.

Platziere den Provider oberhalb des Routen-Outlets, damit er während dieser Sequenz gemountet bleibt.

## Nach benutzerdefinierten Tools

Auch benutzerdefinierte Tools erhalten nach der Aktion einen vollständig gesetzten Snapshot. Warte nach Mutationen auf die API, aktualisiere sichtbare Daten und gib eine stabile URL zurück. Melde eine erfolgreiche Mutation nicht allein deshalb als fehlgeschlagen, weil eine spätere Cache-Aktualisierung gescheitert ist. Siehe [Tools und geführte Abläufe](./tools.md).

## Fehlerbehebung

| Symptom | Ursache und Lösung |
| --- | --- |
| URL ändert sich, aber der Snapshot zeigt die vorherige Seite | Aktiviere `waitForNavigationSignal` und sende `wp-nova:settled`, nachdem die Routendaten gerendert wurden. |
| Jede Navigation wartet bis `maxWaitMs` | Das Signal wird nie, zu früh oder aufgrund einer Bereitschaftsprüfung gesendet, die unabhängige globale Requests beobachtet. |
| Snapshot ist `unsettled` | Die harte Obergrenze wurde erreicht. Korrigiere die Bereitschaftserkennung oder lass Nova `refresh_context` aufrufen. |
| Tool erhält `stale_handle` | Das DOM hat sich geändert. Erfasse beziehungsweise aktualisiere den Kontext und verwende ein Handle aus dem neuesten Snapshot oder bevorzuge eine URL. |
| Benutzer sieht beim Öffnen eines Datensatzes eine Bestätigung | `open_record` ist vorsichtshalber bestätigungspflichtig, weil sein Handle-Fallback die Host-Oberfläche anklickt. |

## Browser-Prüfungen

Teste die direkte Navigation zu:

- einer statischen Seite;
- einer lazy geladenen Route;
- einer Route mit asynchronen Daten;
- einer Detailroute mit einer beobachteten ID;
- einer verweigerten Route für einen eingeschränkten Benutzer;
- einer Route, deren Loader einen Leer- oder Fehlerzustand zurückgibt.

Prüfe bei jeder angenommenen Navigation, ob der zurückgegebene Snapshot den geladenen Inhalt des Ziels enthält und nicht nur die neue URL oder den alten Bildschirm.
