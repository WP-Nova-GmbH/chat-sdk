---
id: security
title: Sicherheit & Berechtigungen
---

## Sicherheit & Berechtigungen

Das SDK ist um eine enge Vertrauensgrenze im Browser herum entworfen.

- Der Browser erhält niemals das Nova-Integrations-Secret.
- Das SDK postet Nachrichten nur an die exakte Origin des iframes.
- Eingehende Frames müssen sowohl `event.origin` als auch `event.source` erfüllen.
- Tool-Fehler sind explizit typisierte Frames, keine stillen leeren Ergebnisse.
- Die Klassifizierung mutierender Tools erfolgt serverseitig; das SDK führt nur freigegebene Anfragen aus.
- Feldwerte sind standardmäßig gesperrt, und Sensitivitätsprüfungen können nicht durch Opt-in-Selektoren umgangen werden.

### Verantwortlichkeiten des Token-Endpoints

Dein Backend muss den aktuellen Benutzer über deine eigene Session
authentifizieren. Prüfe die angefragte Public Surface ID sowie Body-Origin und
tatsächlichen `Origin`-Header gegen die erwartete App-Konfiguration. Rufe Nova
mit einem serverseitigen Secret und Timeout auf, setze `Cache-Control: no-store`
und reiche Token- oder Unavailable-Antwort vollständig durch.

Die Antwort für nicht verfügbare Benutzer kann eine zweckgebundene
`access_request_token`-Berechtigung enthalten. Sie kann ausschließlich eine
Zugriffsanfrage erstellen oder deren Status lesen und authentifiziert keine
Chat-API. Gib auch `message_is_custom` unverändert weiter: `false` erlaubt dem
iframe, Novas integrierten Text zu lokalisieren; `true` bewahrt den von
Administratoren verfassten Surface-Text.

Vertraue für die Token-Ausstellung keiner E-Mail-Adresse und keiner Benutzer-ID, die vom Browser geliefert wird.

Der SDK-Fetch enthält Cookies, aber keinen anwendungsspezifischen Bearer-Header.
Eine Bearer-SPA sollte daher über einen separat geschützten Endpoint eine kurze,
opake `HttpOnly`-Session erzeugen, die der Token-Endpoint auflöst und beim
Logout widerruft.

### Tool-Berechtigungen

SDK-Code deklariert Tools vollständig über `registerTool`; die Surface hat nur
einen Page-Tools-Freigabeschalter. Nova validiert die Definition und entscheidet
serverseitig, ob die iframe-Bestätigung erforderlich ist. Registriere ein Tool
nur, wenn der aktuelle Benutzer auch die zugrunde liegende UI/API-Aktion
ausführen darf. Backend-Autorisierung bleibt Pflicht.

### CSP und Framing

Die Nova-iframe-Route sollte von erlaubten Kunden-Origins geframed werden können. Das aktuelle Fronto-Deployment hält `/sdk/v1/sdk.js` ohne Cache, während unveränderliche SDK-URLs langlebig und für SRI geeignet sind.
