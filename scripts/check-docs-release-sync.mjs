import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();

const publicPackagePaths = [
    "packages/chat-sdk/package.json",
    "packages/react/package.json",
    "packages/angular/package.json",
];

const metadataPath = "apps/docs/src/data/docsReleaseMetadata.ts";
const currentDocsRoots = ["apps/docs/docs", "apps/docs/i18n", "apps/docs/static/prompts"];

const immutableCdnPatchUrlPattern = /https:\/\/chat\.wp-nova\.ai\/sdk\/\d+\.\d+\.\d+\/sdk\.js/g;
const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

function fail(message, details = []) {
    console.error(`Docs release sync check failed: ${message}`);
    for (const detail of details) {
        console.error(`- ${detail}`);
    }
    process.exitCode = 1;
}

async function readJson(relativePath) {
    const source = await readFile(path.join(repoRoot, relativePath), "utf8");
    return JSON.parse(source);
}

function parseMajorMinor(version, packageName) {
    const match = version.match(semverPattern);
    if (!match) {
        throw new Error(`${packageName} has an unsupported version: ${version}`);
    }

    return `${match[1]}.${match[2]}`;
}

async function getCurrentDocsSdkLine() {
    const source = await readFile(path.join(repoRoot, metadataPath), "utf8");
    const match = source.match(
        /export\s+const\s+currentDocsRelease\s*=\s*{[\s\S]*?sdkLine:\s*"(\d+\.\d+)"/,
    );

    if (!match) {
        throw new Error(`Could not read currentDocsRelease.sdkLine from ${metadataPath}`);
    }

    return match[1];
}

function shouldSkipDirectory(relativePath) {
    return (
        relativePath.includes("versioned_docs") ||
        relativePath.includes("versioned_sidebars") ||
        /docusaurus-plugin-content-docs\/version-[^/]+/.test(relativePath)
    );
}

async function listFiles(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const entries = await readdir(absolutePath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const childPath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
            if (!shouldSkipDirectory(childPath)) {
                files.push(...(await listFiles(childPath)));
            }
            continue;
        }

        if (entry.isFile()) {
            files.push(childPath);
        }
    }

    return files;
}

async function findHardcodedCurrentDocsCdnUrls() {
    const findings = [];

    for (const root of currentDocsRoots) {
        const files = await listFiles(root);

        for (const file of files) {
            const source = await readFile(path.join(repoRoot, file), "utf8");
            const matches = source.match(immutableCdnPatchUrlPattern);

            if (matches) {
                findings.push(`${file}: ${[...new Set(matches)].join(", ")}`);
            }
        }
    }

    return findings;
}

async function main() {
    const packages = await Promise.all(
        publicPackagePaths.map(async (packagePath) => {
            const manifest = await readJson(packagePath);
            return {
                name: manifest.name,
                path: packagePath,
                version: manifest.version,
            };
        }),
    );

    const packageVersions = new Set(packages.map((pkg) => pkg.version));
    if (packageVersions.size !== 1) {
        fail(
            "public package versions diverged",
            packages.map((pkg) => `${pkg.name}@${pkg.version} (${pkg.path})`),
        );
    }

    const packageVersion = packages[0].version;
    const packageSdkLine = parseMajorMinor(packageVersion, packages[0].name);
    const currentDocsSdkLine = await getCurrentDocsSdkLine();

    if (packageSdkLine !== currentDocsSdkLine) {
        fail(
            `current docs line ${currentDocsSdkLine} does not match package line ${packageSdkLine}`,
            [
                `Package version: ${packageVersion}`,
                `Docs metadata: ${metadataPath} currentDocsRelease.sdkLine`,
            ],
        );
    }

    const hardcodedCdnUrls = await findHardcodedCurrentDocsCdnUrls();
    if (hardcodedCdnUrls.length > 0) {
        fail(
            "current docs contain immutable CDN URLs pinned to exact patch versions",
            hardcodedCdnUrls,
        );
    }

    if (!process.exitCode) {
        console.log(`Docs release metadata is synced with @wp-nova/chat-sdk ${packageVersion}.`);
    }
}

main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
});
