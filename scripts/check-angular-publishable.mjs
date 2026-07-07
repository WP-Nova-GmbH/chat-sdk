// Guards the Angular wrapper release.
//
// @wp-nova/chat-sdk-angular is built by ng-packagr into packages/angular/dist,
// and that directory — NOT the package root — is what must be published. The
// package root manifest deliberately has no main/module/types/exports (ng-packagr
// owns and generates those in the dist manifest), so publishing the root ships an
// unresolvable package. That is exactly how a broken 1.0.0 reached npm.
//
// This check asserts the freshly built dist is a self-describing, resolvable npm
// package before `npm run release` publishes it. Run it after `npm run build`.

import { access, readFile } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve(process.cwd(), "packages/angular/dist");
const manifestPath = path.join(distDir, "package.json");

function fail(message) {
    console.error(`Angular publishable check failed: ${message}`);
    console.error(
        "Build the package first (`npm run build`), then publish packages/angular/dist — never the package root.",
    );
    process.exit(1);
}

let manifest;
try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
    fail(`missing or unreadable ${path.relative(process.cwd(), manifestPath)}`);
}

if (manifest.name !== "@wp-nova/chat-sdk-angular") {
    fail(`unexpected package name in dist manifest: ${manifest.name}`);
}

const entry = manifest.exports?.["."];
const resolvedEntry = entry?.default ?? entry?.import;
const resolvedTypes = entry?.types ?? manifest.typings ?? manifest.types;

if (!resolvedEntry) {
    fail('dist manifest has no exports["."] runtime entry — consumers cannot resolve the package');
}
if (!resolvedTypes) {
    fail("dist manifest has no types entry — TypeScript consumers get no types");
}

const requiredFiles = [
    path.join(distDir, resolvedEntry),
    path.join(distDir, resolvedTypes),
];
for (const file of requiredFiles) {
    try {
        await access(file);
    } catch {
        fail(`referenced artifact is missing: ${path.relative(process.cwd(), file)}`);
    }
}

console.log(
    `packages/angular/dist is publishable: entry ${resolvedEntry}, types ${resolvedTypes}.`,
);
