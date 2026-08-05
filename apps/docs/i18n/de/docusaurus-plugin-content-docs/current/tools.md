---
id: tools
title: Tools und geführte Abläufe
---

Der eingebettete Nova-Chat kann Konversationstools, integrierte Seitensteuerungen,
SDK-definierte Host-Tools und serverseitige Backend-Tools verwenden. Sie haben
unterschiedliche Verantwortliche und Sicherheitsregeln.

## Tool-Kategorien

| Kategorie | Beispiele | Verantwortlich | Host-Handler? |
| --- | --- | --- | --- |
| Konversation | `request_user_input` | Nova-iframe/-Backend | Nein. Das iframe rendert und beantwortet die Auswahlkarte. |
| Integrierte Seitensteuerung | `navigate`, `click`, `open_record`, `set_filter`, `scroll_to`, `refresh_context` | Deklaration durch Nova; Ausführung durch das SDK | Kein benutzerdefinierter Handler. Erfordert Page Navigation. |
| SDK-definiertes Host-Tool | `list_customers`, `create_ticket`, `set_customer_status` | Deine Integration | Ja, registriert mit der vollständigen Tool-Definition. Erfordert Page Tools. |
| Backend-Tool | Domain-spezifische Recherche | Server/Nova-Verbindung | Kein Browser-Handler; serverseitige Autorisierung. |
| Nova-Server-Tool | Wissenssuche oder andere Nova-seitige Funktionen | Nova | Kein Handler auf der Host-Seite. Die Verfügbarkeit hängt vom Nova-Agenten ab. |

Registriere weder `request_user_input` noch den Namen einer integrierten Seitensteuerung. Diese Namen sind reserviert. Browser-Tools werden über mehrere Turns hinweg sequenziell ausgeführt; entwirf einen mehrstufigen Ablauf als Folge von Aufrufen, die sich auf aktuelle Daten stützen, und nicht als parallele Browser-Aktionen.

Backend-Tools werden nicht mit `registerTool` registriert. API-Schlüssel,
Kataloge und `connectionKey`/`toolId`/`contractVersion` bleiben serverseitig.
Automatische Workflows verwenden nur freigegebene Lesetools; Schreibvorgänge
bleiben bestätigte Chat-Aktionen. Siehe
[Automatische Seiten-Workflows](./page-workflows.md).

## Integrierte Seitensteuerungen

Wenn Page Navigation aktiviert ist, kann Nova folgende Aktionen anbieten:

| Aktion | Verhalten | Bestätigung |
| --- | --- | --- |
| `navigate` | Öffnet eine Same-Origin-URL, vorzugsweise aus deklarierten Routen oder einem erfassten href. | Nein |
| `click` | Klickt über das neueste Handle auf ein sichtbares Bedienelement. | Ja; beliebige Bedienelemente können Daten verändern. |
| `open_record` | Öffnet einen sichtbaren Datensatz über eine beständige URL oder ein aktuelles Handle. | Ja; der Fallback kann die Host-Oberfläche anklicken. |
| `set_filter` | Aktualisiert ein sichtbares Such-/Filterelement und sendet Input-/Change-Events. | Nein |
| `scroll_to` | Scrollt ein aktuelles Handle in den sichtbaren Bereich. | Nein |
| `refresh_context` | Erfasst einen neuen Seiten-Snapshot, ohne die Seite zu verändern. | Nein |

`highlight` ist vom SDK-Protokoll reserviert, wird derzeit aber nicht als Agentenfunktion angeboten. Entwirf keinen Ablauf, der davon abhängt.

Der Agent bevorzugt URLs gegenüber Element-Handles, weil URLs Neurenderings im Hintergrund überstehen. Handles gehören ausschließlich zum neuesten Snapshot.

## SDK-definiertes Tool registrieren

Halte den agentenseitigen Vertrag und die Implementierung zusammen:

```ts
import { registerTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "create_ticket",
  description:
    "Creates a support ticket after the customer and title have been resolved.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      customerId: { type: "string", description: "Stable customer UUID." },
      title: { type: "string", minLength: 1 },
      priority: { type: "string", enum: ["low", "normal", "high"] },
    },
    required: ["customerId", "title"],
  },
  mutating: true,
  confirmationCopy: "Create this support ticket?",
  handler: async (args, { signal } = {}) => {
    const result = validateCreateTicket(args);
    if (!result.ok) {
      return {
        ok: false,
        code: "validation_error",
        message: result.message,
        issues: result.issues,
      };
    }

    const ticket = await crm.createTicket(result.value, { signal });
    return {
      ok: true,
      ticketId: ticket.id,
      url: `/tickets/${ticket.id}`,
    };
  },
});
```

Die Page-Tools-Einstellung der Surface entscheidet, ob Nova die registrierte Definition annimmt. Nova validiert die Spezifikation erneut; die dortige Mutationsklassifizierung ist für die Bestätigungsabfrage im iframe maßgeblich.

## Definitionsgrenzen

Eine Definition muss sowohl die SDK- als auch die Nova-Validierung erfüllen:

- Der Name beginnt mit einem Kleinbuchstaben und enthält nur Kleinbuchstaben, Zahlen und Unterstriche.
- Namen integrierter Tools sind reserviert.
- Die Beschreibung ist aussagekräftig und mindestens 20 Zeichen lang; Nova akzeptiert höchstens 2.000.
- `inputSchema` ist ein einfaches JSON-Schema-Objekt, höchstens 16 KiB groß, maximal 8 Ebenen tief und enthält höchstens 500 Objektschlüssel.
- `mutating` ist ein expliziter boolescher Wert.
- Ein veränderndes Tool besitzt einen benutzerbezogenen `confirmationCopy`-Text mit höchstens 500 Zeichen.
- Ein Surface-Turn akzeptiert höchstens 50 SDK-definierte Tools.
- Handler-Argumente und -Ergebnisse sind JSON-serialisierbar; halte Ergebnisse deutlich unter Novas Tool-Ergebnisgrenze von 32 KiB.

Bevorzuge einfache, anbieterkompatible Schemas. Manche Modellanbieter lehnen komplexe `anyOf`-/`oneOf`-Kombinationen auf oberster Ebene in Funktionsdeklarationen ab. Beschreibe feldübergreifende Anforderungen in der Beschreibung, führe bei Bedarf einen kleinen Preflight aus und validiere bedingte Regeln immer im Handler.

## Zuerst schreibgeschützte Lookup-Tools entwerfen

Ein eigenes schreibgeschütztes Tool ist zuverlässiger, als den Agenten durch eine paginierte oder virtualisierte Oberfläche navigieren zu lassen, um Identifikatoren zu ermitteln.

Gute Lookup-Tools:

- verwenden denselben berechtigungsabhängigen Service wie die Produktoberfläche;
- unterstützen einen begrenzten Suchbegriff;
- geben stabile maschinenlesbare IDs getrennt von lokalisierten Anzeigebezeichnungen zurück;
- enthalten gültige abhängige Werte, etwa die verfügbaren Kategorien eines Lieferanten;
- geben stabile Same-Origin-URLs zurück, wenn Datensätze geöffnet werden können;
- begrenzen Ergebnisse und geben `truncated: true` zurück, wenn weitere Treffer vorhanden sind;
- beschreiben exakt, wann der Agent sie aufrufen muss.

```ts
registerTool({
  name: "list_customers",
  description:
    "Authoritative customer lookup for the signed-in user. Use before a workflow needs a customer id; refine when results are truncated.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      search: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
  mutating: false,
  handler: async ({ search }, { signal } = {}) => {
    const matches = await crm.searchCustomers(String(search ?? ""), { signal });
    return {
      customers: matches.slice(0, 12).map((customer) => ({
        id: customer.id,
        label: customer.displayName,
        description: customer.address,
        url: `/customers/${customer.id}`,
      })),
      truncated: matches.length > 12,
    };
  },
});
```

Wenn das Tool zwei bis zwölf durch aktuelle Daten belegte Kandidaten zurückgibt und eine Auswahl erforderlich ist, kann Nova mit `request_user_input` eine eingebettete Auswahlkarte anzeigen. Genau ein gültiger Kandidat kann normalerweise automatisch ausgewählt werden. Mehr als zwölf oder unvollständige Ergebnisse sollten einen engeren Lookup oder eine Freitextsuche auslösen – keine erfundene oder vermeintlich vollständige Liste.

## Verändernde Abläufe sicher fortsetzbar machen

Für einen Mutations-Handler gilt:

1. Prüfe Berechtigungs-/Mandantenbereich und validiere die Argumente sowie aktuelle Domänenregeln erneut.
2. Löse Namen in stabile IDs auf; verwende niemals Zeilenpositionen oder Seiten-Handles als Domänen-IDs.
3. Beachte das optionale `AbortSignal` und rufe den normalen Service beziehungsweise Mapper der Anwendung auf.
4. Gib erwartete Fehler als strukturierte Daten zurück; wirf nur bei unerwarteten Fehlern eine Exception.
5. Aktualisiere nach Erfolg die sichtbaren Daten und gib eine stabile URL zurück.

Das iframe ist für die Bestätigung verantwortlich; füge keinen weiteren Dialog hinzu. Das SDK dedupliziert erneut übermittelte Aufrufe mit demselben Nova-Idempotenzschlüssel, kritische APIs sollten jedoch ebenfalls idempotent sein. Wenn die Erstellung erfolgreich ist und nur die Cache-Aktualisierung scheitert, gib Erfolg zurück, um einen doppelten Versuch zu vermeiden.

## Handlungsorientierte Fehler zurückgeben

Modelliere erwartete Ergebnisse ausdrücklich:

```ts
type ToolFailure =
  | { ok: false; code: "forbidden"; message: string }
  | { ok: false; code: "not_found"; message: string; candidates?: Candidate[] }
  | { ok: false; code: "ambiguous"; message: string; candidates: Candidate[] }
  | { ok: false; code: "validation_error"; message: string; issues: FieldIssue[] }
  | { ok: false; code: "conflict"; message: string };
```

Begrenze Meldungen, lasse Secrets und interne Fehlerausgaben weg und gib an, ob ein erneuter Versuch neue Eingaben, einen aktualisierten Lookup oder eine Benutzeraktion erfordert.

## Nur registrieren, was der Benutzer verwenden darf

Die Tool-Registrierung legt Funktionen offen. Schütze jedes Tool mit denselben Rollen-, Ressourcen-, Kunden-, Modul- und Feature-Prüfungen wie die entsprechende UI-Aktion.

Melde Tools bei Berechtigungsänderungen und beim Teardown ab. Stabile Definitionen und Hooks beschreibt der [React-Leitfaden](./react.md).

## Verifizierungsmatrix

Teste mindestens:

| Szenario | Erwartetes Ergebnis |
| --- | --- |
| Freigabe oder Berechtigung deaktiviert | Tool ist nicht vorhanden und die direkte API-Nutzung wird abgelehnt. |
| Lookup gibt 1 / 2–12 / gekürzte Ergebnisse zurück | Agent wählt den einen Treffer aus, fragt mit durch aktuelle Daten belegten Auswahlmöglichkeiten oder verfeinert die Suche. |
| Ungültige oder widersprüchliche Eingabe | Keine Mutation; strukturierte Hinweise zu Feld oder Kandidaten bleiben erhalten. |
| Mutation angenommen oder abgelehnt | iframe fordert einmal eine Bestätigung an; der Handler läuft nur nach Zustimmung. |
| Handler fehlt, überschreitet die Zeit oder wird abgebrochen | Typisierter handlungsorientierter Fehler; es startet kein verspäteter Seiteneffekt. |
| Erfolg | Sichtbare Daten werden aktualisiert und das Ergebnis enthält eine stabile Same-Origin-URL. |
