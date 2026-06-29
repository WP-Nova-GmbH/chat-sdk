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
  protocolVersion?: number;
}

export type ToolHandler = (
  args: Record<string, unknown>,
) => unknown | Promise<unknown>;
```

### Custom Element

Das SDK definiert `<wp-nova-chat>` lazy und idempotent. Du kannst das Element vorab im DOM platzieren, aber die meisten Integrationen sollten es von `init` erstellen und mounten lassen.
