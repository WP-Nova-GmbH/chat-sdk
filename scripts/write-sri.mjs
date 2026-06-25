import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const file = resolve(process.argv[2] || "dist/index.global.js");
const source = await readFile(file);
const integrity = "sha384-" + createHash("sha384").update(source).digest("base64");

await writeFile(file + ".sri", integrity + "\n");
console.log(integrity);
