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
  voiceMode?: boolean;
  protocolVersion?: number;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  opts?: { signal?: AbortSignal },
) => unknown | Promise<unknown>;
```

### Utilisateur indisponible

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

`message_is_custom: false` identifie le message intégré de Nova, que l’iframe
traduit. La valeur `true` identifie un texte rédigé par un administrateur et
affiché sans modification. Transmettez la réponse complète pour que l’action de
demande d’accès reste disponible.

### Custom Element

Le SDK définit `<wp-nova-chat>` de façon lazy et idempotente. Vous pouvez placer l’élément à l’avance dans le DOM, mais la plupart des intégrations doivent laisser `init` le créer et le monter.
