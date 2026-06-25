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

Dein Backend muss den aktuellen Benutzer über deine eigene Session authentifizieren. Es sollte Nova mit einem serverseitigen Secret aufrufen und entweder die Token-Antwort oder die Antwort für einen nicht verfügbaren Benutzer zurückgeben.

Vertraue für die Token-Ausstellung keiner E-Mail-Adresse und keiner Benutzer-ID, die vom Browser geliefert wird.

### CSP und Framing

Die Nova-iframe-Route sollte von erlaubten Kunden-Origins geframed werden können. Das aktuelle Fronto-Deployment hält `/sdk/v1/sdk.js` ohne Cache, während unveränderliche SDK-URLs langlebig und für SRI geeignet sind.
