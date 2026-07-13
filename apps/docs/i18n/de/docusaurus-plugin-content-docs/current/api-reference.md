---
id: api-reference
title: API-Referenz
---

## API-Referenz

### Globaler Dispatcher

```ts
WpNova("init", config);
WpNova("registerToolHandler", name, handler);
WpNova("unregisterToolHandler", name);
```

### npm-Helper

```ts
import {
  WpNova,
  init,
  registerToolHandler,
  unregisterToolHandler,
  defineElement,
  ELEMENT_TAG,
  WpNovaChatElement,
} from "@wp-nova/chat-sdk";
```

### Typen

```ts
export interface SdkConfig {
  publicSurfaceId: string;
  tokenEndpoint: string;
  baseUrl?: string;
  mount?: string | HTMLElement;
  title?: string;
  accent?: string;
  triggerColor?: string;
  triggerIconColor?: "light" | "dark" | string;
  safeValueSelectors?: string[];
  voiceMode?: boolean;
  protocolVersion?: number;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
) => unknown | Promise<unknown>;
```

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
