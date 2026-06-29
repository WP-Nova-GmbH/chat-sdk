# Nova Chat SDK

Monorepo for the Nova Chat SDK npm packages and Docusaurus documentation host.

## Workspaces

- `apps/docs` - Docusaurus documentation site.
- `packages/chat-sdk` - core browser SDK published as `@wp-nova/chat-sdk`.
- `packages/react` - React wrapper published as `@wp-nova/chat-sdk-react`.
- `packages/angular` - Angular wrapper published as `@wp-nova/chat-sdk-angular`.
- `packages/typescript-config` - internal shared TypeScript presets.
- `examples/*` - framework-specific integration examples built against the local workspace source.
- `release-examples/*` - standalone apps that consume the **published** packages from npm (outside the workspaces). See [`release-examples/README.md`](release-examples/README.md).

## Commands

```bash
npm install
npm run build
npm run check-types
npm run lint
npm test
```

## Browser Examples

Build the SDK packages once, then start either example app:

```bash
npm --workspace @wp-nova/chat-sdk run build
npm --workspace @wp-nova/chat-sdk-react run build
npm --workspace @wp-nova/chat-sdk-angular run build
```

React, on `http://127.0.0.1:4311`:

```bash
NOVA_TOKEN_BASE_URL=http://localhost:8400 \
NOVA_INTEGRATION_SECRET="<surface integration secret>" \
NOVA_TEST_EMAIL="react-operator@example.com" \
VITE_NOVA_PUBLIC_SURFACE_ID="<surface public id>" \
VITE_NOVA_BASE_URL=http://localhost:5173 \
VITE_NOVA_TOKEN_ENDPOINT=/api/nova-token \
npm --workspace @wp-nova/chat-sdk-example-react run dev
```

Angular, on `http://127.0.0.1:4312`:

```bash
NOVA_TOKEN_BASE_URL=http://localhost:8400 \
NOVA_INTEGRATION_SECRET="<surface integration secret>" \
NOVA_TEST_EMAIL="angular-concierge@example.com" \
VITE_NOVA_PUBLIC_SURFACE_ID="<surface public id>" \
VITE_NOVA_BASE_URL=http://localhost:5173 \
VITE_NOVA_TOKEN_ENDPOINT=/api/nova-token \
npm --workspace @wp-nova/chat-sdk-example-angular run dev
```

Both examples mount chat automatically when a surface id is available. They also
accept `?surface=surf_...&baseUrl=http://localhost:5173&tokenEndpoint=/api/nova-token`.

## Releases

`npm run release` builds every package, runs `npm run check-angular-publishable`,
and then publishes each package from the directory that produces a resolvable npm
tarball:

- `@wp-nova/chat-sdk` and `@wp-nova/chat-sdk-react` publish from their package
  roots (their manifests declare `exports` and `files: ["dist"]`).
- `@wp-nova/chat-sdk-angular` publishes from its **built `packages/angular/dist`**
  directory. ng-packagr owns the dist manifest, so the package root deliberately
  has no `main`/`module`/`types`/`exports`. Publishing the Angular package root
  ships an unresolvable package (`npm install @wp-nova/chat-sdk-angular` then fails
  with `ERR_MODULE_NOT_FOUND`). Do **not** use `changeset publish` for this repo,
  because it publishes the Angular package root. `npm run check-angular-publishable`
  guards against publishing a malformed Angular artifact.

Use `npm run version-packages` (`changeset version`) only to bump versions; use
`npm run release` to publish. The CI workflow in `.github/workflows/release.yml`
publishes the same three targets the same way.

After a release, package patch releases do not need new docs selector entries. Run
`npm run check-docs-release-sync` before publishing to confirm the package
major/minor line still matches the current docs line and current docs do not pin
an exact CDN patch URL.

When a major or minor release changes the documented integration contract,
snapshot the outgoing docs line before updating current docs:

```bash
npm run docs:snapshot -- 1.0.0
```

Then update `apps/docs/src/data/docsReleaseMetadata.ts` to the new current SDK
line and add the outgoing line to `historicalDocsReleases`. Run
`npm run docs:release-check` before publishing docs.
