---
id: dom-access
title: Dem Agenten DOM-Zugriff geben
---

## Dem Agenten DOM-Zugriff geben

Nova kann auf der Host-Seite kein beliebiges JavaScript ausführen. Es kann nur Fähigkeiten anfordern, die das SDK über Seiten-Snapshots, eingebaute Navigationsaktionen und von dir registrierte Tool-Handler bereitstellt.

### Tool-Handler registrieren

```ts
import { registerToolHandler, unregisterToolHandler } from "@wp-nova/chat-sdk";

registerToolHandler("set_customer_status", async (args) => {
  const customerId = String(args.customerId);
  const status = String(args.status);
  await crm.updateCustomer(customerId, { status });
  return { ok: true, customerId, status };
});

unregisterToolHandler("set_customer_status");
```

Welche Tools der Agent anfragen darf, wird serverseitig auf der Embedded Surface definiert. Die Registrierung im Browser stellt nur die passenden Ausführungs-Callbacks bereit.

### Seiten-Snapshots

Wenn das iframe `REQUEST_SNAPSHOT` sendet, erfasst das SDK sichtbare Seitenstruktur, Text, Links, Bedienelemente, Labels, Auswahl, strukturierte Daten und stabile Element-Handles. Geschlossene Shadow Roots, Cross-Origin-iframes, Canvas-Bereiche und zu große Seiten werden als teilweise oder gekürzt markiert.

### Feldwerte sind standardmäßig gesperrt

Eingabewerte werden ausgelassen, sofern sie nicht ausdrücklich erlaubt sind und weiterhin Sensitivitätsprüfungen bestehen.

- Füge `data-wp-nova-include` zu einem Feld oder Vorfahren hinzu.
- Oder übergib Selektoren in `safeValueSelectors`.
- Passwörter, versteckte Inputs, Dateien, Zahlungsfelder, Tokens, Secrets und ähnliche sensible Felder werden immer ausgeschlossen.

Verwende `data-wp-nova-ignore` für jeden Teilbaum, den der Assistent nicht sehen soll.
