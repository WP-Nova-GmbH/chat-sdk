// The repo root is not a published package: it has no version, and its tarball
// would be the whole monorepo. `npm publish` here does not reach the release
// chain either — npm packs and uploads the root first, and fails on the missing
// version before the `publish` lifecycle script ever runs.
//
// Wired as the root `prepublishOnly` so that mistake stops here, with the
// command that actually publishes, instead of an npm error about a manifest
// nobody meant to publish.

console.error(
    [
        "The repo root is not published.",
        "",
        "To publish the SDK packages:",
        "",
        "    npm login",
        "    npm run release",
        "",
        "That builds every package, checks the Angular dist is publishable, and",
        "publishes @wp-nova/chat-sdk, -react and -angular at the version in their",
        "manifests. It skips versions already on the registry, so re-running after",
        "a partial failure is safe.",
    ].join("\n"),
);

process.exit(1);
