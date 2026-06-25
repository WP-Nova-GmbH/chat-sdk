# Agent Guidelines

## Commit Messages

Commit messages must always follow the structure `type(targeted_apps_or_packages): summary`, for example `feat(docs): add quickstart tabs` or `fix(react): clean up provider teardown`.

Rules for the parentheses:

- List the affected app(s) and package(s), comma-separated with no spaces, for example `refactor(angular,sdk,react): simplify lifecycle wiring`.
- Use targets from the workspace paths, never the feature, ticket, or issue being worked on.
- When a change touches only repo-wide or root-level files, use `repo`, for example `chore(repo): update workspace tooling`.
- When a change touches an app plus supporting package code, list the app and any directly edited packages.
- Keep the full commit header at or below 120 characters.

Common targets in this repo:

- `docs` for `apps/docs`.
- `sdk` for `packages/chat-sdk`.
- `react` for `packages/react`.
- `angular` for `packages/angular`.
- `typescript-config` for `packages/typescript-config`.
- `repo` for root-level tooling, CI, and agent guidance.

Before committing, inspect the staged paths and derive the scope from the targeted apps and packages.
