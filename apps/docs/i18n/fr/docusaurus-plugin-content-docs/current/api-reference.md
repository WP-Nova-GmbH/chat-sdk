---
id: api-reference
title: Référence API
---

## Référence API

### Dispatcher global

```ts
WpNova("init", config);
WpNova("registerToolHandler", name, handler);
WpNova("unregisterToolHandler", name);
```

### Helpers npm

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

### Types

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

Le SDK définit `<wp-nova-chat>` de façon lazy et idempotente. Vous pouvez placer l’élément à l’avance dans le DOM, mais la plupart des intégrations doivent laisser `init` le créer et le monter.
