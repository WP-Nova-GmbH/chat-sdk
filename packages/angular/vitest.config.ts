import { defineConfig } from "vitest/config";

// The Angular wrapper is compiled by ng-packagr for publishing; the unit tests
// only need the transformer to handle the component/service the way the Angular
// toolchain does: legacy (experimental) decorators so `@Component`/`@Input` and
// `inject()` in a field initializer behave as in a real Angular build.
export default defineConfig({
    oxc: {
        decorator: { legacy: true },
        typescript: { useDefineForClassFields: false },
    },
    test: {
        environment: "jsdom",
        include: ["src/**/*.test.ts"],
    },
});
