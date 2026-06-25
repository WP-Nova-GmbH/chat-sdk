---
id: api-reference
title: API reference
---

## API Reference

### Global Dispatcher

```ts
WpNova("init", config);
WpNova("registerToolHandler", name, handler);
WpNova("unregisterToolHandler", name);
```

### npm Helpers

```ts
import {
  WpNova,
  init,
  registerToolHandler,
  unregisterToolHandler,
  defineElement,
  ELEMENT_TAG,
  WpNovaChatElement,
} from "@wp-nova/sdk";
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

The SDK defines `<wp-nova-chat>` lazily and idempotently. You can pre-place the element in the DOM, but most integrations should let `init` create and mount it.
