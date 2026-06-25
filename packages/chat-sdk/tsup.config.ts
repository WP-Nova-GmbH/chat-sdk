import { defineConfig } from "tsup";

// The SDK ships separate entries so npm imports stay side-effect-light while the
// CDN artifact still installs and drains the queued window.WpNova snippet.
export default defineConfig([
    {
        entry: { index: "src/index.ts" },
        format: ["esm", "cjs"],
        target: "es2019",
        dts: true,
        clean: true,
        minify: true,
        splitting: false,
        sourcemap: false,
    },
    {
        entry: { index: "src/global.ts" },
        format: ["iife"],
        globalName: "WpNovaBundle",
        target: "es2019",
        dts: false,
        clean: false,
        minify: true,
        splitting: false,
        sourcemap: false,
    },
]);
