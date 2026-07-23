---
id: api-reference
title: API-Referenz
---

## API-Referenz

### Globaler Dispatcher

```ts
WpNova("init", config);
WpNova("registerTool", definition);
WpNova("unregisterTool", name);
WpNova("destroy");
```

### npm-Helper

```ts
import {
  WpNova,
  init,
  registerTool,
  unregisterTool,
  destroy,
  DEFAULT_SETTLE,
  SETTLED_EVENT,
  defineElement,
  ELEMENT_TAG,
  WpNovaChatElement,
  type HostTheme,
} from "@wp-nova/chat-sdk";
```

### Typen

```ts
export type HostTheme = "light" | "dark";

export interface SdkConfig {
  publicSurfaceId: string;
  tokenEndpoint: string;
  baseUrl?: string;
  mount?: string | HTMLElement;
  title?: string;
  accent?: string;
  triggerColor?: string;
  triggerColorLight?: string;
  triggerColorDark?: string;
  triggerIconColor?: "light" | "dark" | string;
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

`registerToolHandler` bleibt nur als veralteter, ausführungsbezogener
Kompatibilitäts-Helper verfügbar. Ein solcher Handler wird dem Agenten nicht
angeboten.

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

Das SDK definiert `<wp-nova-chat>` lazy und idempotent. Du kannst das Element vorab im DOM platzieren, aber die meisten Integrationen sollten es von `init` erstellen und mounten lassen.
