import { defineConfig } from "tsup";

export default defineConfig({
    entry: { index: "src/index.tsx" },
    format: ["esm", "cjs"],
    target: "es2019",
    dts: true,
    clean: true,
    sourcemap: false,
    external: ["react", "@wp-nova/chat-sdk"]
});
