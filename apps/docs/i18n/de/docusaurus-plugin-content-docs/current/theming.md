---
id: theming
title: Design-Anpassung
---

## Design-Anpassung

Das SDK steuert nur den Launcher und das äußere Panel. Das iframe steuert
Chat-Header und Konversationsoberfläche und verwendet nach der Authentifizierung
vertrauenswürdige Anzeigeeinstellungen der Surface. Der Hell-/Dunkelmodus der
Host-Seite ist eine getrennte Eingabe: Er steuert den Farbmodus des iframes,
ersetzt aber weder Titel noch Logo oder Akzent der Surface.

Lege sichtbaren Titel, Logo, Primär-/Akzentfarbe, Launcher-Hintergrund und
Icon-Kontrast getrennt fest. Interner Surface-Name und sichtbarer Chat-Titel
sind nicht dasselbe.

```ts
init({
  publicSurfaceId: "srf_live_...",
  tokenEndpoint: "/api/nova-token",
  accent: "#9A72F8",
  triggerColor: "#7E54E4",
  triggerColorLight: "#7E54E4",
  triggerColorDark: "#A991F2",
  triggerIconColor: "light",
  theme: "light",
});
```

### Erster Render

Wenn `accent`, `triggerColor` oder die modusspezifische Farbe für den aktiven
Modus gesetzt ist, kann der Launcher schon vor der ersten Token-Antwort
markengerecht gerendert werden. Andernfalls bleibt er verborgen, bis
vertrauenswürdige Theme-Daten der Surface aus dem iframe eintreffen.

Der SDK-Fallback ist Nova-Lila. Verwende für ein anderes Produkt die echte
sechsstellige Primärfarbe explizit; ohne `triggerColor` fällt der
Launcher-Hintergrund auf `accent` zurück.

Verwende `triggerColorLight` und `triggerColorDark`, wenn der Launcher auf
hellen und dunklen Host-Seiten unterschiedlichen Kontrast benötigt. Der Wert
für den aktiven Modus überschreibt `triggerColor`; fehlt er, folgen
`triggerColor` und danach `accent`. Bestehende Integrationen mit ausschließlich
`triggerColor` verhalten sich unverändert. Änderungen an `theme` oder den
modusspezifischen Farben werden live angewendet, ohne iframe oder
Authentifizierung neu aufzubauen.

### Icon-Farbe des Launchers

`triggerIconColor` akzeptiert `light`, `dark` oder eine Hex-Farbe. Ungültige Werte werden ignoriert und fallen auf einen lesbaren Standard zurück.

### Hell-/Dunkelmodus der Host-Seite

Übergib den aktuellen Modus der Host-Anwendung ausdrücklich:

```ts
const chatConfig = {
  publicSurfaceId: "surf_...",
  tokenEndpoint: "/api/nova-token",
};

function syncChatTheme(theme: "light" | "dark") {
  init({ ...chatConfig, theme });
}
```

Ohne `theme` verwendet das SDK immer `light`. Es liest absichtlich weder ein
WP-Chat-Theme-Cookie noch leitet es den Modus aus `prefers-color-scheme` ab; die
Host-Anwendung ist die Quelle der Wahrheit. Rufe bei einer Änderung `init`
erneut auf oder aktualisiere den Config-Wert des React-/Angular-Wrappers. Das
SDK sendet `HOST_THEME` an das bestehende iframe, ohne das Token neu abzurufen;
Route und Konversation bleiben erhalten. Panel- und iframe-Hintergrund,
modusspezifische Erhebung sowie eine feine Randlinie werden sofort angepasst.
So entsteht kein kontrastierendes Aufblitzen und die Panel-Kante bleibt auch
vor einem gleichfarbigen Host-Hintergrund sichtbar.
