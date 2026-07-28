---
id: api-reference
title: API-Referenz
---

## API-Referenz

### Globaler Dispatcher

```ts
WpNova("init", config);
WpNova("open");
WpNova("close");
WpNova("toggle");
WpNova("registerTool", definition);
WpNova("unregisterTool", name);
WpNova("destroy");
```

### npm-Helper

```ts
import {
  WpNova,
  init,
  open,
  close,
  toggle,
  isOpen,
  subscribeOpenChange,
  registerTool,
  unregisterTool,
  destroy,
  DEFAULT_SETTLE,
  SETTLED_EVENT,
  defineElement,
  ELEMENT_TAG,
  SIDEBAR_RESIZE_EVENT,
  WpNovaChatElement,
  type ChatPresentation,
  type HostTheme,
  type SidebarResizeDetail,
} from "@wp-nova/chat-sdk";
```

### Typen

```ts
export type HostTheme = "light" | "dark";

export type ChatPresentation =
  | { mode?: "popover" }
  | { mode: "sidebar"; width?: number; resizable?: boolean };

export interface SdkConfig {
  publicSurfaceId: string;
  tokenEndpoint: string;
  baseUrl?: string;
  mount?: string | HTMLElement;
  presentation?: ChatPresentation;
  title?: string;
  accent?: string;
  triggerColor?: string;
  triggerColorLight?: string;
  triggerColorDark?: string;
  triggerIconColor?: "light" | "dark" | string;
  launcher?: boolean;
  theme?: HostTheme;
  safeValueSelectors?: string[];
  voiceMode?: boolean;
  routes?: Array<{ path: string; description: string }>;
  settle?: {
    quietMs?: number;
    maxWaitMs?: number;
    waitForNavigationSignal?: boolean;
  };
  protocolVersion?: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutating: boolean;
  confirmationCopy?: string;
  handler: ToolHandler;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
) => unknown | Promise<unknown>;
```

Nur `publicSurfaceId` und `tokenEndpoint` sind erforderlich. `theme` ist
standardmäßig `light` und übermittelt den aktuellen Hell-/Dunkelmodus der
Host-Seite an das iframe. Ein weiterer `init`-Aufruf mit einem anderen Wert
aktualisiert das bestehende iframe, ohne ein neues Token abzurufen oder die
Konversation zurückzusetzen. `triggerColorLight` und `triggerColorDark`
überschreiben `triggerColor` jeweils nur im zugehörigen Modus.

`presentation` ist standardmäßig `{ mode: "popover" }`. Die Sidebar-Breite ist
standardmäßig `384`, wird bei numerischen Werten auf `320–640` begrenzt und
fällt bei ungültigen Laufzeitwerten mit einer Warnung auf `384` zurück. Der
Sidebar-Modus erfordert einen expliziten, auflösbaren `mount`. Wenn der
Mount-Container schmaler als `sidebarWidth + 384px` ist, verwendet die
effektive Darstellung vorübergehend Pop-over. Die Breite bleibt fest, sofern
nicht `resizable: true` gesetzt ist. Dann unterstützt der integrierte Separator
Pointer und Tastatur und sendet nach jeder abgeschlossenen Änderung
`wp-nova:sidebar-resize` mit `SidebarResizeDetail`.

`registerToolHandler` bleibt nur als veralteter, ausführungsbezogener
Kompatibilitäts-Helper verfügbar. Ein solcher Handler wird dem Agenten nicht
angeboten.

### Panel-Steuerung

Der SDK-eigene Launcher ist standardmäßig aktiv. Setze `launcher: false`, wenn
die Host-Seite einen eigenen Button bereitstellt, und verwende `open()`,
`close()` oder `toggle()`. `isOpen()` liefert den aktuellen Zustand;
`subscribeOpenChange()` meldet auch Änderungen durch den Minimieren-Button im
iframe. Das gemountete Element sendet zusätzlich das Event
`wp-nova:open-change` mit `{ open: boolean }` in `detail`.

Ein Post-Action-Snapshot kann `truncated`, `partial` oder `unsettled` sein
und enthält die validierten `siteRoutes`.

### Nicht verfügbarer Benutzer

```ts
export interface UnavailableUserResponse {
  unavailable: true;
  email: string;
  message: string;
  message_is_custom?: boolean;
  access_request_token?: string;
  access_request_expires_in?: number;
  access_token?: undefined;
}
```

`message_is_custom: false` kennzeichnet Novas integrierte Nachricht, die das
iframe lokalisiert. Der Wert `true` kennzeichnet von Administratoren verfassten
Text, der unverändert angezeigt wird. Gib die vollständige Antwort weiter, damit
die Aktion zum Anfordern des Zugriffs verfügbar ist.

### Custom Element

Das SDK definiert `<wp-nova-chat>` lazy und idempotent. Du kannst das Element
vorab im DOM platzieren, aber die meisten Integrationen sollten es von `init`
erstellen und mounten lassen. Das Element spiegelt konfigurierte und effektive
Darstellung über `data-wpn-presentation` und
`data-wpn-effective-presentation`; die validierte Breite ist intern als
`--wpn-sidebar-width` verfügbar. `data-wpn-sidebar-resizable` spiegelt den
aktivierten Resize-Separator. Die effektive Sidebar ist eine benannte
`complementary`-Region, der Pop-over bleibt ein nicht modaler Dialog. Das SDK
schließt seinen eigenen Teilbaum aus Host-Seiten-Snapshots aus, ohne ihn aus
dem Accessibility Tree zu entfernen.

`wp-nova:sidebar-resize` ist ein bubbling und composed
`CustomEvent<SidebarResizeDetail>` mit `{ width: number }`. Verwende in
npm-Integrationen die Konstante `SIDEBAR_RESIZE_EVENT`. Der Wert ist bereits
begrenzt; übergib ihn erneut als `presentation.width`, um die Auswahl über
spätere `init()`-Aufrufe hinweg zu erhalten.
