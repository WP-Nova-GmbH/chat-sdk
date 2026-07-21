export {
    buildDisabledMessage,
    formatErrorMessage,
    missingRequiredConfigFields,
    reportOperationError,
} from "./config/diagnostics.js";
export { DEFAULT_SETTLE, SETTLED_EVENT, type SettleOptions } from "./page/settle.js";
// Consumer-facing types only. The postMessage wire/frame protocol stays internal
// to the package (import from "./protocol/types/index.js" inside the SDK) so a wire refactor is
// not a public SemVer-major and autocomplete is not flooded with ~45 frame types.
export type {
    ClientToolResult,
    PageContext,
    SdkConfig,
    SiteRoute,
    SurfaceDisplaySettings,
    ToolDefinition,
    ToolHandler,
} from "./protocol/types/index.js";
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
} from "./runtime/controller.js";
export { defineElement, ELEMENT_TAG, WpNovaChatElement } from "./runtime/element/index.js";
