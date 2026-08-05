---
id: events
title: Ereignisse
---

## Ereignisse

Das Bridge-Protokoll ist bewusst explizit. Jeder Frame enthält ein Source-Tag und eine Protokollversion, und Request/Response-Paare enthalten eine `correlationId`.

### Wichtige Frames

| Frame | Richtung | Zweck |
| --- | --- | --- |
| `READY` | iframe an SDK | Das iframe ist bereit, Token- und Tool-Registrierungsdaten zu empfangen. |
| `HOST_THEME` | SDK an iframe | Wendet den aktuellen hellen oder dunklen Modus der Host-Seite an. Wird bei `READY` und nach Live-Änderungen der Konfiguration gesendet. |
| `AUTH_TOKEN` | SDK an iframe | Sendet ein kurzlebiges Embedded-Session-Token. |
| `AUTH_EXPIRED` | iframe an SDK | Fordert nach einem 401 ein neues Token an. |
| `REQUEST_SNAPSHOT` | iframe an SDK | Fordert frischen sichtbaren Seitenkontext an. |
| `CLIENT_TOOL_REQUEST` | iframe an SDK | Fordert eine eingebaute Navigationsaktion oder ein registriertes Tool an. |
| `CLIENT_TOOL_RESULT` | SDK an iframe | Gibt das Tool-Ergebnis und einen frischen Snapshot zurück. |
| `CLIENT_TOOL_ERROR` | SDK an iframe | Gibt typisierte Fehlerdetails wie `no_handler` oder `timeout` zurück. |
| `START_PAGE_WORKFLOW` | SDK an iframe | Startet den passenden `research-and-compose`-Workflow. |
| `CANCEL_PAGE_WORKFLOW` | SDK an iframe | Bricht einen noch nicht gestarteten Workflow ab. |
| `PAGE_WORKFLOW_STATUS` | iframe an SDK | Meldet `started`, `cached`, `completed`, `failed` oder `skipped`. |
| `REGISTER_TOOLS` | SDK an iframe | Meldet aktuell SDK-definierte Tool-Spezifikationen. |
| `SURFACE_THEME` | iframe an SDK | Wendet vertrauenswürdige Theme-Werte der Surface auf den SDK-eigenen Launcher an. |
| `MINIMIZE` | iframe an SDK | Blendet das SDK-eigene Panel über dessen Header aus, ohne das iframe zu entfernen oder zu navigieren. |

### Token-Erneuerung

Das SDK erneuert proaktiv bei ungefähr 80 Prozent von `expires_in` und reaktiv, wenn das iframe `AUTH_EXPIRED` sendet.

Transportfehler werden mit Backoff und Cooldown erneut versucht. Eine Antwort für einen nicht verfügbaren Benutzer ist final und wird als `UNAVAILABLE` an das iframe gesendet.

Die Workflow-Readiness wird mit `setPageReady(false)` während des Ladens und
`setPageReady(true)` nach dem Rendern gesetzt. Ein Refresh derselben URL erhält
einen bereits laufenden Workflow.

Host-SPAs verwenden zusätzlich zwei Window-Events: `wp-nova:navigate` für
same-origin Router-Navigation und `wp-nova:settled` für die fertig gerenderte
Zielansicht. Erreicht die Post-Action-Wartezeit ihr Limit, ist der Snapshot
`unsettled` und Nova kann `refresh_context` aufrufen.

Eine optional anpassbare Sidebar sendet außerdem
`wp-nova:sidebar-resize`. Das Event verlässt das Custom Element als bubbling
und composed Event und enthält `{ width: number }` in `detail`. Es wird nach
einem abgeschlossenen Pointer-Ziehen und nach jeder unterstützten
Tastaturänderung gesendet. Speichere die begrenzte Breite und übergib sie als
`presentation.width`, wenn sie spätere `init()`-Aufrufe überdauern soll.
