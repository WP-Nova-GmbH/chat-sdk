---
id: angular
title: Angular
---

## Angular

`@wp-nova/chat-sdk-angular` fournit un service Angular, un provider d'environnement et un composant standalone.

```bash
npm install @wp-nova/chat-sdk @wp-nova/chat-sdk-angular
```

```ts
import { bootstrapApplication } from "@angular/platform-browser";
import { provideNovaChat } from "@wp-nova/chat-sdk-angular";

bootstrapApplication(AppComponent, {
  providers: [
    provideNovaChat({
      publicSurfaceId: "srf_live_...",
      tokenEndpoint: "/api/nova-token",
    }),
  ],
});
```

```ts
import { Component, inject } from "@angular/core";
import { NovaChatComponent, NovaChatService } from "@wp-nova/chat-sdk-angular";

@Component({
  standalone: true,
  selector: "app-root",
  imports: [NovaChatComponent],
  template: `<wp-nova-chat-mount />`,
})
export class AppComponent {
  readonly nova = inject(NovaChatService);

  constructor() {
    this.nova.registerTool({
      name: "show_toast",
      description: "Affiche un message bref et non persistant dans la page hôte.",
      inputSchema: {
        type: "object",
        properties: { message: { type: "string" } },
        required: ["message"],
      },
      mutating: false,
      handler: async (args) => {
        return { ok: true, message: String(args["message"] ?? "") };
      },
    });
  }
}
```

Sinon, `<wp-nova-chat-mount [tools]="tools" />` reçoit des définitions
complètes. Filtrez routes/outils par permissions et émettez
`wp-nova:settled` après le rendu des données de la route Angular.

Si le thème hôte peut changer après l’amorçage, liez la `SdkConfig` actuelle à
l’input `config` du composant ou appelez
`NovaChatService.init(updatedConfig)`. Un changement de `theme` met à jour le
lanceur, le panneau et l’iframe existante sans récupérer de nouveau token ni
perdre la conversation. `triggerColorLight` et `triggerColorDark` mettent le
lanceur existant à jour sans remontage.

### Pop-over et barre latérale interchangeables

Placez un conteneur grid/flex stable avant
`<wp-nova-chat-mount>` et liez une nouvelle référence `SdkConfig` lorsque la
présentation change :

```ts
mode: "popover" | "sidebar" = "popover";
config: SdkConfig = this.buildConfig();

togglePresentation() {
  this.mode = this.mode === "popover" ? "sidebar" : "popover";
  this.config = this.buildConfig();
}

private buildConfig(): SdkConfig {
  return {
    publicSurfaceId: "surf_...",
    tokenEndpoint: "/api/nova-token",
    mount: "#nova-layout",
    presentation:
      this.mode === "sidebar"
        ? { mode: "sidebar", width: 420, resizable: true }
        : { mode: "popover" },
  };
}
```

Le conteneur de montage utilise généralement
`grid-template-columns: minmax(0, 1fr) auto`, une hauteur disponible définie
et `min-width: 0` sur le contenu principal. Angular réagit à la nouvelle
référence de configuration ; le SDK cœur préserve l’iframe,
l’authentification, les outils, l’état ouvert/fermé et la conversation. Voir
[Configuration : présentation](./configuration.md#présentation) pour la
validation de largeur et le fallback responsive.
Sans `resizable`, la largeur reste fixe. Lorsque le glisser est activé,
l’application hôte doit enregistrer `event.detail.width` depuis
`wp-nova:sidebar-resize` dans une nouvelle référence de configuration.

Pour un bouton fourni par la page hôte, définissez `launcher: false`.
`NovaChatService` fournit `open()`, `close()` et `toggle()` :

```html
<button type="button" (click)="nova.toggle()">Assistant</button>
<wp-nova-chat-mount />
```
