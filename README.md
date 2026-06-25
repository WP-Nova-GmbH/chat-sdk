# Nova Chat SDK

Monorepo for the Nova Chat SDK npm packages and Docusaurus documentation host.

## Workspaces

- `apps/docs` - Docusaurus documentation site.
- `packages/chat-sdk` - core browser SDK published as `@wp-nova/sdk`.
- `packages/react` - React wrapper published as `@wp-nova/sdk-react`.
- `packages/angular` - Angular wrapper published as `@wp-nova/sdk-angular`.
- `packages/typescript-config` - internal shared TypeScript presets.
- `examples/*` - framework-specific integration examples.

## Commands

```bash
npm install
npm run build
npm run check-types
npm run lint
npm test
```
