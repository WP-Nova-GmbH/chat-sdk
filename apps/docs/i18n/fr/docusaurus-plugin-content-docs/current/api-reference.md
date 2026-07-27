---
id: api-reference
title: Référence API
---

## Référence API

### Dispatcher global

```ts
WpNova("init", config);
WpNova("open");
WpNova("close");
WpNova("toggle");
WpNova("registerTool", definition);
WpNova("unregisterTool", name);
WpNova("destroy");
```

### Helpers npm

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
  WpNovaChatElement,
  type ChatPresentation,
  type HostTheme,
} from "@wp-nova/chat-sdk";
```

### Types

```ts
export type HostTheme = "light" | "dark";

export type ChatPresentation =
  | { mode?: "popover" }
  | { mode: "sidebar"; width?: number };

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

Seuls `publicSurfaceId` et `tokenEndpoint` sont obligatoires. Par défaut,
`theme` vaut `light` et transmet à l’iframe le mode clair/sombre actuel de la
page hôte. Un nouvel appel à `init` avec une autre valeur met à jour l’iframe
existante sans récupérer de nouveau token ni réinitialiser la conversation.
`triggerColorLight` et `triggerColorDark` remplacent `triggerColor` uniquement
dans leur mode respectif.

`presentation` vaut `{ mode: "popover" }` par défaut. La largeur de la barre
latérale vaut `384`, les valeurs numériques sont limitées à `320–640` et une
valeur d’exécution non valide revient à `384` avec un avertissement. Le mode
barre latérale exige un `mount` explicite et résolvable. Lorsque le conteneur
est plus étroit que `sidebarWidth + 384px`, la présentation effective repasse
temporairement en pop-over.

`registerToolHandler` reste uniquement comme helper de compatibilité obsolète,
limité à l’exécution. Un handler seul n’est pas proposé à l’agent.

### Contrôle du panneau

Le lanceur du SDK est activé par défaut. Définissez `launcher: false` lorsque
la page hôte fournit son propre bouton, puis utilisez `open()`, `close()` ou
`toggle()`. `isOpen()` renvoie l’état courant et `subscribeOpenChange()` signale
aussi les changements venant du bouton de réduction dans l’iframe. L’élément
monté émet également `wp-nova:open-change` avec `{ open: boolean }` dans
`detail`.

Un instantané post-action peut être `truncated`, `partial` ou `unsettled`
et contient les `siteRoutes` validées.

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

Le SDK définit `<wp-nova-chat>` de façon lazy et idempotente. Vous pouvez placer
l’élément à l’avance dans le DOM, mais la plupart des intégrations doivent
laisser `init` le créer et le monter. L’élément reflète la présentation
configurée et effective avec `data-wpn-presentation` et
`data-wpn-effective-presentation` ; la largeur validée est exposée en interne
par `--wpn-sidebar-width`. La barre latérale effective est une région
`complementary` nommée, tandis que le pop-over reste une boîte de dialogue non
modale. Le SDK exclut son propre sous-arbre des instantanés de la page hôte sans
le retirer de l’arbre d’accessibilité.
