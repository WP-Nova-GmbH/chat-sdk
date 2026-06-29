// Idempotent publisher for the linked @wp-nova/chat-sdk* packages.
//
// Publishes ONLY package versions that are not already on the npm registry. The
// three packages are `linked` (not `fixed`) in .changeset/config.json, so a
// changeset may bump just one of them — e.g. an Angular-only patch while the core
// and React packages stay put. Raw `npm publish` refuses to republish an existing
// version (E403) and aborts the chain, so this script compares each manifest
// version against the registry and skips what is already there. Re-runs are safe.
//
// Angular is published from its ng-packagr `dist` output, never the package root
// (the root manifest deliberately has no exports — see check-angular-publishable.mjs).
//
// Run after `npm run build` (and `npm run check-angular-publishable`).

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

// Publish order matters: the core package must exist before the wrappers that
// depend on it can be installed. `versionFrom` is the manifest that is actually
// published (for Angular that is the built dist manifest).
const targets = [
    {
        name: "@wp-nova/chat-sdk",
        versionFrom: "packages/chat-sdk/package.json",
        publishArgs: ["publish", "--workspace", "packages/chat-sdk", "--access", "public"],
    },
    {
        name: "@wp-nova/chat-sdk-react",
        versionFrom: "packages/react/package.json",
        publishArgs: ["publish", "--workspace", "packages/react", "--access", "public"],
    },
    {
        name: "@wp-nova/chat-sdk-angular",
        versionFrom: "packages/angular/dist/package.json",
        publishArgs: ["publish", "packages/angular/dist", "--access", "public"],
    },
];

function readManifest(relativePath) {
    try {
        return JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));
    } catch (error) {
        console.error(`Cannot read ${relativePath}: ${error.message}`);
        console.error("Build the packages first with `npm run build`.");
        process.exit(1);
    }
}

function isOnRegistry(name, version) {
    try {
        const out = execFileSync("npm", ["view", `${name}@${version}`, "version"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
        // Exact version present -> prints it. Package exists but version missing
        // -> prints "" (exit 0). Whole package missing -> E404 (throws below).
        return out === version;
    } catch {
        return false;
    }
}

const published = [];
const skipped = [];

for (const target of targets) {
    const manifest = readManifest(target.versionFrom);
    if (manifest.name !== target.name) {
        console.error(
            `Manifest name mismatch in ${target.versionFrom}: got ${manifest.name}, expected ${target.name}`,
        );
        process.exit(1);
    }

    const { version } = manifest;
    const tag = `${target.name}@${version}`;

    if (isOnRegistry(target.name, version)) {
        console.log(`= skip ${tag} (already on registry)`);
        skipped.push(tag);
        continue;
    }

    console.log(`+ publishing ${tag} ...`);
    execFileSync("npm", target.publishArgs, { stdio: "inherit" });
    published.push({ name: target.name, version });
}

console.log("");
console.log(
    `Published: ${published.length ? published.map((p) => `${p.name}@${p.version}`).join(", ") : "(none)"}`,
);
console.log(`Skipped:   ${skipped.length ? skipped.join(", ") : "(none)"}`);

// Expose results to the workflow so the CDN step only runs when the core SDK
// (whose dist/index.global.js is what the CDN serves) was actually published.
if (process.env.GITHUB_OUTPUT) {
    const core = published.find((p) => p.name === "@wp-nova/chat-sdk");
    const coreVersion = readManifest("packages/chat-sdk/package.json").version;
    appendFileSync(
        process.env.GITHUB_OUTPUT,
        [
            `published_core=${core ? "true" : "false"}`,
            `core_version=${coreVersion}`,
            `published=${published.map((p) => `${p.name}@${p.version}`).join(",")}`,
            "",
        ].join("\n"),
    );
}
