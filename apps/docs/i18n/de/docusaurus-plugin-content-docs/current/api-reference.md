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
  setPageReady,
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

type WorkflowToolReference =
  | { location: "site"; toolId: string; contractVersion: string }
  | { location: "backend"; connectionKey: string; toolId: string; contractVersion: string };
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
type WorkflowInputBinding =
  | { kind: "literal"; value: JsonValue }
  | { kind: "path"; parameter: string };
type WorkflowOutputAssertion =
  | { pointer: string; operator: "exists" | "nonEmpty" }
  | { pointer: string; operator: "equals"; value: JsonValue };
type PageWorkflowRequiredTool = {
  id: string;
  tool: WorkflowToolReference;
  inputs: Record<string, WorkflowInputBinding>;
  outputAssertions?: WorkflowOutputAssertion[];
};

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
  locale?: string;
  safeValueSelectors?: string[];
  voiceMode?: boolean;
  routes?: Array<{ path: string; description: string }>;
  pageWorkflows?: Array<{
    id: string;
    path: string;
    execution: {
      mode: "research-and-compose";
      availableBackendTools?: Array<{
        connectionKey: string;
        toolId: string;
        contractVersion: string;
      }>;
    };
    prompt: string;
    requiredTools?: PageWorkflowRequiredTool[];
  }>;
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
  user_creation_required?: boolean;
  user_creation_token?: string;
  user_creation_expires_in?: number;
  access_token?: undefined;
}
```

`message_is_custom: false` kennzeichnet Novas integrierte Nachricht, die das
iframe lokalisiert. Der Wert `true` kennzeichnet von Administratoren verfassten
Text, der unverändert angezeigt wird. Gib die vollständige Antwort weiter, damit
die Aktion zum Anfordern des Zugriffs verfügbar ist.

Nova sendet entweder das Berechtigungspaar für eine Zugriffsanfrage oder das
Berechtigungspaar für bestätigte JIT-Erstellung; beide Gruppen werden in einer
Plattformantwort nie kombiniert. Der strukturelle SDK-Typ bleibt permissiv,
damit ein Proxy zusätzliche Felder unverändert weiterreichen kann.

`locale` ist ein optionales BCP-47-Locale. `pageWorkflows` startet auf passenden
Seiten begrenzte `research-and-compose`-Abläufe. Siehe
[Automatische Seiten-Workflows](./page-workflows.md) für `requiredTools`,
Backend-Tool-Verträge, Readiness und Quellen.

Seitenkontext kann außerdem `languageSignals` enthalten:

```ts
languageSignals?: {
  hostLocale?: string;
  documentLocale?: string;
  browserLocales?: string[];
}
```

Diese Werte sind normalisierte Sprachhinweise, keine Autorisierung.

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
