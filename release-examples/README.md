# Release examples

Three standalone host apps that consume the **published** Nova Chat SDK packages
and follow the integration docs exactly. They exist to prove the released
artifacts work for an outside developer.

Unlike the apps under `examples/`, these projects live **outside** the monorepo
`workspaces`. Each has its own `package.json`, lockfile, and `node_modules`, so
`npm install` resolves the SDK from the npm registry (or a vendored release
tarball) instead of linking the local `packages/*` source.

| App | Consumes | Docs path it follows | Port |
| --- | --- | --- | --- |
| [`react/`](./react) | `@wp-nova/chat-sdk` + `@wp-nova/chat-sdk-react` from npm | [React](https://chat.wp-nova.ai/react) | 4321 |
| [`angular/`](./angular) | `@wp-nova/chat-sdk` from npm + the corrected `@wp-nova/chat-sdk-angular` release tarball | [Angular](https://chat.wp-nova.ai/angular) | 4322 |
| [`plain-html/`](./plain-html) | `@wp-nova/chat-sdk` global build via a pinned, SRI-checked `<script>` | [Quickstart](https://chat.wp-nova.ai/quickstart) + [Release & CDN](https://chat.wp-nova.ai/release-cdn) | 4323 |

Each app is self-contained — see its own `README.md`.

## Why Angular uses a vendored tarball

The published `@wp-nova/chat-sdk-angular@1.0.0` is unresolvable (its package root
shipped without entry points). The fix is in this repo (publish from
`packages/angular/dist`) and ships as `1.0.1`. Until then, the Angular example
installs the corrected artifact from `angular/vendor/*.tgz`, produced by
`npm pack packages/angular/dist`. Once `1.0.1` is published, the app can install
`@wp-nova/chat-sdk-angular` straight from npm like the others.

## Why plain-HTML self-hosts the SDK

The hosted CDN (`https://chat.wp-nova.ai/sdk/<version>/sdk.js`) is not used in
local development, so the plain-HTML app serves the **identical** released
`dist/index.global.js` from its own origin at `/sdk/1.0.0/sdk.js` with the same
Subresource Integrity hash. This validates the documented script-tag + SRI path
byte-for-byte without depending on the CDN.

## Running

```bash
cd release-examples/<app>
npm install
cp .env.example .env   # fill in your surface id + token endpoint values
npm run dev
```
