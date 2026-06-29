export {
    type Command,
    destroy,
    init,
    installGlobal,
    type QueuedWpNova,
    registerTool,
    /** @deprecated Use registerTool so the agent receives the tool spec and handler together. */
    registerToolHandler,
    release,
    retain,
    unregisterTool,
    /** @deprecated Use unregisterTool for SDK-declared tools. */
    unregisterToolHandler,
    WpNova,
} from "./controller.js";
export {
    buildDisabledMessage,
    formatErrorMessage,
    missingRequiredConfigFields,
    reportOperationError,
} from "./diagnostics.js";
export { defineElement, ELEMENT_TAG, WpNovaChatElement } from "./element.js";
// Consumer-facing types only. The postMessage wire/frame protocol stays internal
// to the package (import from "./types.js" inside the SDK) so a wire refactor is
// not a public SemVer-major and autocomplete is not flooded with ~45 frame types.
export type {
    ClientToolResult,
    PageContext,
    SdkConfig,
    SurfaceDisplaySettings,
    ToolDefinition,
    ToolHandler,
} from "./types.js";
