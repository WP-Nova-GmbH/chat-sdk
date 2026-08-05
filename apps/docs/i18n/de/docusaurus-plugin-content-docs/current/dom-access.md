---
id: dom-access
title: Dem Agenten DOM-Zugriff geben
---

## Dem Agenten DOM-Zugriff geben

Nova kann auf der Host-Seite kein beliebiges JavaScript ausführen. Es kann nur
Sichtbare Seiten-Snapshots, von der Surface erlaubte Seitenaktionen und
vollständig per SDK registrierte Host-Tools verwenden.

### SDK-definierte Tools registrieren

```ts
import { registerTool, unregisterTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "set_customer_status",
  description: "Ändert den Status des sichtbaren Kunden im CRM.",
  inputSchema: {
    type: "object",
    properties: { status: { type: "string" } },
    required: ["status"],
  },
  mutating: true,
  confirmationCopy: "Diesen Kundenstatus ändern?",
  handler: async (args) => {
    const status = String(args.status);
    await crm.updateCustomer(status);
    return { ok: true, status };
  },
});

unregisterTool("set_customer_status");
```

Die Registrierung enthält Name, Beschreibung, JSON Schema, Mutationsflag,
Bestätigungstext und Handler. Die Surface speichert nur, ob SDK-definierte Page
Tools erlaubt sind. Eingebaute Aktionen sind `navigate`, `click`,
`open_record`, `set_filter`, `scroll_to` und `refresh_context`;
`click` und `open_record` werden bestätigt. `request_user_input` gehört zum
iframe und wird nie als Host-Tool registriert.

### Seiten-Snapshots

Wenn das iframe `REQUEST_SNAPSHOT` sendet, erfasst das SDK sichtbare Seitenstruktur, Text, Links, Bedienelemente, Labels, Auswahl, strukturierte Daten, Sprachsignale und stabile Element-Handles. `languageSignals` enthält das normalisierte Host-`locale`, die Dokumentensprache und die bevorzugten Browsersprachen. Geschlossene Shadow Roots, Cross-Origin-iframes, Canvas-Bereiche und zu große Seiten werden als teilweise oder gekürzt markiert.

### Feldwerte sind standardmäßig gesperrt

Eingabewerte werden ausgelassen, sofern sie nicht ausdrücklich erlaubt sind und weiterhin Sensitivitätsprüfungen bestehen.

- Füge `data-wp-nova-include` zu einem Feld oder Vorfahren hinzu.
- Oder übergib Selektoren in `safeValueSelectors`.
- Passwörter, versteckte Inputs, Dateien, Zahlungsfelder, Tokens, Secrets und ähnliche sensible Felder werden immer ausgeschlossen.

Verwende `data-wp-nova-ignore` für jeden Teilbaum, den der Assistent nicht sehen soll.

Verwende echte beschriftete Links/Buttons. Ein React-`onClick` auf einer
generischen Tabellenzeile kann für den Snapshot unsichtbar sein.
