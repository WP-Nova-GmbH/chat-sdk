---
id: theming
title: Design-Anpassung
---

## Design-Anpassung

Das SDK steuert nur den Launcher und das äußere Panel. Das iframe steuert Chat-Header und Konversationsoberfläche und verwendet nach der Authentifizierung vertrauenswürdige Anzeigeeinstellungen der Surface.

```ts
init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
  accent: "#9A72F8",
  triggerColor: "#7E54E4",
  triggerIconColor: "light",
});
```

### Erster Render

Wenn `accent` oder `triggerColor` gesetzt ist, kann der Launcher schon vor der ersten Token-Antwort markengerecht gerendert werden. Andernfalls bleibt der Launcher verborgen, bis vertrauenswürdige Theme-Daten der Surface aus dem iframe eintreffen.

### Icon-Farbe des Launchers

`triggerIconColor` akzeptiert `light`, `dark` oder eine Hex-Farbe. Ungültige Werte werden ignoriert und fallen auf einen lesbaren Standard zurück.
