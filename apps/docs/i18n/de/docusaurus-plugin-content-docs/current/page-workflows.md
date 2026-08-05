---
id: page-workflows
title: Automatische Seiten-Workflows
---

Automatische Seiten-Workflows starten einen begrenzten
`research-and-compose`-Lauf, wenn eine passende Seite geöffnet und bereit ist.
Sie werden vom Host ausgelöst und sind an die aktuelle Seite gebunden.

## Workflow konfigurieren

Füge `pageWorkflows` zusammen mit `routes` und `locale` in dieselbe
`init`-Konfiguration ein:

```ts
init({
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
  locale: "de-DE",
  pageWorkflows: [
    {
      id: "summarize-call-intervention",
      path: "/call-center/interventions/:interventionId",
      execution: {
        mode: "research-and-compose",
        availableBackendTools: [
          { connectionKey: "telect", toolId: "call_intervention_history", contractVersion: "2" },
          { connectionKey: "telect", toolId: "call_intervention_callbacks", contractVersion: "2" },
          { connectionKey: "telect", toolId: "call_intervention_operational_context", contractVersion: "2" },
        ],
      },
      requiredTools: [
        {
          id: "intervention_context",
          tool: { location: "backend", connectionKey: "telect", toolId: "call_intervention_context", contractVersion: "4" },
          inputs: { interventionId: { kind: "path", parameter: "interventionId" } },
          outputAssertions: [
            { pointer: "/intervention/id", operator: "nonEmpty" },
            { pointer: "/version", operator: "equals", value: 4 },
            { pointer: "/evidenceRevision", operator: "exists" },
            { pointer: "/ready", operator: "equals", value: true },
          ],
        },
      ],
      prompt: "Schreibe eine kurze Übergabe für die geladene Intervention. Belege Aussagen mit [source:s1] und erfinde keine Details.",
    },
  ],
});
```

`PageWorkflowDefinition` enthält `id`, den exakten `path`, `prompt` und
`execution.mode: "research-and-compose"`. Ein `:param` belegt genau ein
Pfadsegment. `requiredTools` liefern deterministische Vorab-Evidenz. Ihre
Ergebnisse müssen das deklarierte Ausgabeschema erfüllen; erforderliche Tools
dürfen nicht mutieren. Sie können `site`- oder `backend`-Tools verwenden.
Eingaben können aus einem Pfad
kommen (`{ kind: "path", parameter }`) oder literal sein. Ergebnisse werden
mit RFC-6901-Pointern und `exists`, `nonEmpty` oder `equals` geprüft.

## Readiness und Lebenszyklus

Ein Workflow startet nur, wenn die aktuelle URL, `setPageReady(true)`, geöffnete
Chat-Seitenleiste, Authentifizierung und die Iframe-Fähigkeit
`page-workflows` zusammenpassen. Rufe während des Ladens
`setPageReady(false)` und nach dem Rendern der Route und ihrer Daten wieder
`setPageReady(true)` auf. Das SDK bindet die Readiness an die aktuelle URL. In React kommt die Methode aus
`useNovaChat()`.

Bei SPA-Navigation behandelt der Host `wp-nova:navigate` und sendet
`wp-nova:settled` erst nach URL-, Komponenten- und Daten-Readiness. Dieses
Signal beendet nur das Post-Navigation-Settling; Workflow-Readiness wird
separat mit `setPageReady(true)` gesetzt. Wenn der
Chat erst nach dem Laden geöffnet wird, muss die Readiness erneut gesetzt
werden. Eine andere URL ersetzt den lokalen Versuch, sobald der Host die
Readiness für diese URL erneut setzt; ein Refresh derselben URL
behält einen bereits gestarteten Lauf; ein gestarteter Serverlauf kann
fortsetzen. Die Statuswerte sind `started`,
`cached`, `completed`, `failed` und `skipped`.

Schließen vor dem Start bricht den Versuch ab. Ein abgeschlossenes Ergebnis
kann im aktuellen oder in einem neuen Gespräch fortgesetzt und als normale
Chat-Historie materialisiert werden.

## Backend-Tools und Quellen

Backend-Tools laufen serverseitig. Erstelle, teste und verwalte die Verbindung
in Nova, halte API-Schlüssel und optionale `backendToolGrants` auf dem Server;
es gibt im Browser keinen Tool-Handler. `availableBackendTools` listet nur
schreibgeschützte Recherche-Tools. Schreibende Tools gehören in eine explizit
bestätigte Chat-Aktion. Berechtigungen werden beim Erstellen des Delegated
Grant und erneut bei der Ausführung geprüft.

Ergebnisse können Quellen enthalten:

```ts
{ sources: [{ id: "internal-source-id", label: "Call record", description: "Current application record", observedAt: "2026-08-05T10:30:00Z" }] }
```

Nova ersetzt interne IDs durch sichere lokale Referenzen wie `[source:s1]`.
Ein optionaler Recherchefehler wird als Einschränkung gemeldet; ein Fehler bei
erforderlicher Evidenz schlägt geschlossen fehl. Die aktuelle UI kann Marker
oder sichtbare Quellenchips ausblenden. Nenne fehlende Evidenz und verspreche
keine Quellenchips.
Siehe [API-Referenz](./api-reference.md).

## Grenzen

Maximal 20 Workflows, 10 erforderliche Tools pro Workflow und 16 verfügbare
Backend-Tools werden akzeptiert. IDs beginnen mit einem Buchstaben, Prompts
haben 1–8.000 Zeichen, und Pfade beginnen mit `/` ohne Query oder Hash.
Überlappende oder ungültige Definitionen werden gewarnt und verworfen.
Verwende nur Workflows und Tools, die der aktuelle Benutzer sehen darf. Quellen
dürfen keine API-Schlüssel, Provider-IDs oder ungebundene Tool-Payloads enthalten.
