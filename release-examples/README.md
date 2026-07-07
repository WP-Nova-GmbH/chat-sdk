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
| [`angular/`](./angular) | `@wp-nova/chat-sdk` + `@wp-nova/chat-sdk-angular` (`^1.0.1`) from npm | [Angular](https://chat.wp-nova.ai/angular) | 4322 |
| [`plain-html/`](./plain-html) | `@wp-nova/chat-sdk` global build via a pinned, SRI-checked `<script>` | [Quickstart](https://chat.wp-nova.ai/quickstart) + [Release & CDN](https://chat.wp-nova.ai/release-cdn) | 4323 |

Each app is self-contained — see its own `README.md`.

## Why Angular pins `@wp-nova/chat-sdk-angular@^1.0.1`

The published `@wp-nova/chat-sdk-angular@1.0.0` was unresolvable (its package root
shipped without entry points, so imports failed with `ERR_MODULE_NOT_FOUND`).
`1.0.1` is the fixed publish, built from `packages/angular/dist`, so the Angular
example pins `^1.0.1` to skip the broken `1.0.0`. Core and React resolve from
`^1.0.0`.

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
