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
| `AUTH_TOKEN` | SDK an iframe | Sendet ein kurzlebiges Embedded-Session-Token. |
| `AUTH_EXPIRED` | iframe an SDK | Fordert nach einem 401 ein neues Token an. |
| `REQUEST_SNAPSHOT` | iframe an SDK | Fordert frischen sichtbaren Seitenkontext an. |
| `CLIENT_TOOL_REQUEST` | iframe an SDK | Fordert eine eingebaute Navigationsaktion oder ein registriertes Tool an. |
| `CLIENT_TOOL_RESULT` | SDK an iframe | Gibt das Tool-Ergebnis und einen frischen Snapshot zurück. |
| `CLIENT_TOOL_ERROR` | SDK an iframe | Gibt typisierte Fehlerdetails wie `no_handler` oder `timeout` zurück. |

### Token-Erneuerung

Das SDK erneuert proaktiv bei ungefähr 80 Prozent von `expires_in` und reaktiv, wenn das iframe `AUTH_EXPIRED` sendet.

Transportfehler werden mit Backoff und Cooldown erneut versucht. Eine Antwort für einen nicht verfügbaren Benutzer ist final und wird als `UNAVAILABLE` an das iframe gesendet.
