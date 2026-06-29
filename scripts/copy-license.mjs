import { copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Companion to write-sri.mjs: a small root-level build helper invoked from each
// package's build script. Copies the single source-of-truth root LICENSE into the
// invoking package (default destination ./LICENSE) so every published tarball
// ships license text and stays in sync with the repo root.
const source = resolve(dirname(fileURLToPath(import.meta.url)), "..", "LICENSE");
const dest = resolve(process.argv[2] || "LICENSE");

await copyFile(source, dest);
console.log(`Copied LICENSE -> ${dest}`);
