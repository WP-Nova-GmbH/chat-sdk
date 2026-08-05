---
id: quickstart
title: Schnellstart
---

## Schnellstart

Plane vor dem Einbau Authentifizierung, berechtigte Benutzer/Module,
Page Reading/Navigation/Tools, Host-Tools, Routen, Datenschutz, Readiness,
JIT-Benutzererstellung, Workflows und Primärfarbe. Wähle danach den Script-Tag
oder npm.

### Script Tag

Das Queue-Snippet erlaubt dir, Tools zu registrieren, bevor die SDK-Datei geladen ist. Aufrufe werden in Reihenfolge abgespielt, sobald das globale Bundle den echten Dispatcher installiert.

```html
<script>
  (function (w, d, s) {
    w.WpNova = w.WpNova || function () {
      (w.WpNova.q = w.WpNova.q || []).push(arguments);
    };
    var j = d.createElement(s);
    j.async = 1;
    j.src = "https://chat.wp-nova.ai/sdk/<version>/sdk.js";
    j.crossOrigin = "anonymous";
    j.integrity = "sha384-<published hash for this version>";
    d.head.appendChild(j);
  })(window, document, "script");

  WpNova("registerTool", {
    name: "create_ticket",
    description: "Erstellt ein Support-Ticket für den sichtbaren Kundenkontext.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"]
    },
    mutating: true,
    confirmationCopy: "Dieses Ticket erstellen?",
    handler: function (args) {
      return window.app.createTicket(args);
    }
  });

  WpNova("init", {
    publicSurfaceId: "srf_live_...",
    tokenEndpoint: "/api/nova-token"
  });
</script>
```

### npm

```bash
npm install @wp-nova/chat-sdk
```

```ts
import { init, registerTool } from "@wp-nova/chat-sdk";

registerTool({
  name: "create_ticket",
  description: "Erstellt ein Support-Ticket für den sichtbaren Kundenkontext.",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  mutating: true,
  confirmationCopy: "Dieses Ticket erstellen?",
  handler: async (args) => myApp.createTicket(args),
});

init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
});
```

Tools sind optional. Der vollständige Vertrag und der Handler leben gemeinsam
in `registerTool`; Nova Admin aktiviert/deaktiviert SDK-definierte Page Tools
nur für die Surface. Registriere Tools und Routen ausschließlich für die
Berechtigungen des aktuellen Benutzers.

### Token Endpoint

Dein Endpoint erhält `{ publicSurfaceId, origin }` vom SDK und sollte den authentifizierten serverseitigen Benutzer verwenden, nicht eine vom Browser behauptete E-Mail-Adresse. Prüfe Surface-ID sowie Body- und Header-Origin gegen die erwartete App-Konfiguration und verwende ein Timeout. Bei einer Bearer-SPA muss die App vorher eine kurze, opake `HttpOnly`-Server-Session erzeugen, weil der SDK-Fetch keinen eigenen Bearer-Header übernimmt.

```ts
app.post("/api/nova-token", async (req, res) => {
  const user = await requireUser(req);
  const response = await fetch("https://api.wp-nova.ai/embed/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.NOVA_INTEGRATION_SECRET}`,
      Origin: req.body.origin,
    },
    body: JSON.stringify({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      publicSurfaceId: req.body.publicSurfaceId,
      origin: req.body.origin,
    }),
  });

  res.status(response.status).type(response.headers.get("content-type") || "application/json");
  res.send(await response.text());
});
```

Wenn die E-Mail-Adresse keinem aktiven Nova-Benutzer zugeordnet ist, enthält die
Antwort keinen Chat-Token:

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

Im bestätigten JIT-Modus verwendet Nova stattdessen:

```json
{
  "unavailable": true,
  "email": "person@example.com",
  "message": "Es wurde kein Nova-Konto gefunden.",
  "message_is_custom": false,
  "user_creation_required": true,
  "user_creation_token": "<zweckgebundene Berechtigung>",
  "user_creation_expires_in": 3600
}
```

Gib Status und Antworttext unverändert weiter. `message_is_custom: false` erlaubt
dem iframe, Novas integrierte Nachricht in der aktiven UI-Sprache anzuzeigen;
benutzerdefinierter Administrator-Text ist mit `true` markiert.

Wenn Workflows Backend-Tools verwenden, kann das Backend optional
`backendToolGrants` mit `{ connectionKey, grant, allowedToolIds? }` an Nova
übergeben. Diese Grants kommen ausschließlich aus vertrauenswürdiger
Serverlogik, sind an Benutzer und Session gebunden und erreichen nie den
Browser.

Die Surface entscheidet zwischen `existing_only` und `jit_active_member`. Im
bestätigten JIT-Modus zeigt das iframe eine explizite Bestätigung und verwendet
danach das zweckgebundene Creation-Token über `POST /embed/users`, bevor eine
normale Chat-Session ausgestellt wird. Eine erfolgreiche Antwort ist
`{ "status": "access_available" }`. Eine Surface kann Provisioning ohne Bestätigung erlauben;
dann erfolgt es bereits beim Minting und kann eine abrechenbare Mitgliedschaft
anlegen. Gib alle Felder unverändert weiter und vertraue niemals Browserdaten
für Identität. JIT-Erstellung ist separat rate-limitiert.
Provisioning-Modus und `POST /embed/users` sind Nova-Plattformverträge, keine
SDK-Konfigurationsfelder, und benötigen das passende Nova-Deployment.

### Routen und Readiness

Übermittle bei Bedarf berechtigungsgefilterte `routes`. In einer SPA fängt der
Host `wp-nova:navigate` ab. Wenn Routendaten asynchron laden, setze
`settle.waitForNavigationSignal: true` und sende `wp-nova:settled` erst nach
gerenderter Zielroute samt benötigten Daten. Ein Timeout markiert den Snapshot
als `unsettled`, damit Nova `refresh_context` verwenden kann.

Für automatische Seiten-Workflows, Backend-Tools und Quellen siehe
[Automatische Seiten-Workflows](./page-workflows.md).
