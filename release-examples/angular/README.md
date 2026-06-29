# Switchyard Dispatch — Angular release example

A standalone Angular host app that follows the
[Angular integration docs](https://chat.wp-nova.ai/angular). It installs the
**released** core package [`@wp-nova/chat-sdk`](https://www.npmjs.com/package/@wp-nova/chat-sdk)
from npm and the `@wp-nova/chat-sdk-angular` wrapper from a vendored release
tarball (see below).

Like the other apps in `release-examples/`, this project lives **outside** the
monorepo workspaces, so it resolves the SDK as an external consumer would rather
than linking the local `packages/*` source.

## What it demonstrates

- `provideNovaChat(config)` in the bootstrap providers (docs: _Provider Setup_).
- The standalone `NovaChatComponent` imported into the app component and mounted
  as `<wp-nova-chat-mount [tools] [enabled]>` (docs: _Component Mount_,
  _Disabling Chat_).
- `NovaChatService.registerTool` from a service (docs: _Service API_).
- Angular JIT compilation in the browser (`main.ts` imports `@angular/compiler`),
  so no Angular build plugin is required with Vite.
- Signals for state, so tool-driven mutations refresh the view under zoneless
  change detection.
- DOM privacy: a `safeValueSelectors` opt-in field (`#dispatch-reference`), an
  ignored region (`data-wp-nova-ignore`), and visible `data-ai-context` facts.

## Why a vendored tarball

The published `@wp-nova/chat-sdk-angular@1.0.0` is unresolvable — its package root
shipped without `main`/`module`/`types`/`exports`. The fix (publish from
`packages/angular/dist`) ships as `1.0.1`. Until then this app installs the
corrected artifact from `vendor/wp-nova-chat-sdk-angular-1.0.0.tgz`, produced by:

```bash
npm pack packages/angular/dist
```

Once `1.0.1` is on npm, change the dependency to
`"@wp-nova/chat-sdk-angular": "^1.0.1"` and reinstall.

## Run it

```bash
npm install
cp .env.example .env   # fill in your surface id + token endpoint values
npm run dev            # http://127.0.0.1:4322
```

The launcher mounts as soon as `VITE_NOVA_PUBLIC_SURFACE_ID` is set, and the
surface's allowed origins must include `http://127.0.0.1:4322`.

## Build

```bash
npm run build   # tsc -p tsconfig.json --noEmit && vite build
```
