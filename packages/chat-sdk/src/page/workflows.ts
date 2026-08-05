import type {
    JsonValue,
    PageWorkflowAvailableBackendTool,
    PageWorkflowDefinition,
    PageWorkflowExecution,
    PageWorkflowRequiredTool,
    WorkflowInputBinding,
    WorkflowOutputAssertion,
    WorkflowToolReference,
} from "../protocol/types/index.js";

export const MAX_PAGE_WORKFLOW_REQUIRED_TOOLS = 10;
export const MAX_PAGE_WORKFLOW_AVAILABLE_BACKEND_TOOLS = 16;
const WORKFLOW_REQUIREMENT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const SITE_TOOL_ID_PATTERN = /^[a-z][a-z0-9_.-]{0,127}$/;
const CONNECTION_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,127}$/;
const CONTRACT_VERSION_PATTERN = /^[1-9][0-9]*$/;

/** Escape a literal pathname segment before inserting it into a RegExp. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match an exact pathname template. A `:param` placeholder consumes one
 * non-empty path segment; static text and trailing slashes remain exact.
 */
export function matchesPageWorkflowPath(template: string, pathname: string): boolean {
    const pattern = template
        .split("/")
        .map((segment) =>
            segment.startsWith(":") && segment.length > 1 ? "[^/]+" : escapeRegExp(segment),
        )
        .join("/");
    return new RegExp(`^${pattern}$`).test(pathname);
}

/** Whether two exact templates can match at least one common pathname. */
export function pageWorkflowPathsOverlap(first: string, second: string): boolean {
    const left = first.split("/");
    const right = second.split("/");
    if (left.length !== right.length) return false;
    return left.every((segment, index) => {
        const other = right[index] ?? "";
        return segment === other || segment.startsWith(":") || other.startsWith(":");
    });
}

/** Return the sole configured workflow matching the pathname, if one exists. */
export function matchingPageWorkflow(
    workflows: readonly PageWorkflowDefinition[],
    pathname: string,
): PageWorkflowDefinition | undefined {
    const matches = workflows.filter((workflow) =>
        matchesPageWorkflowPath(workflow.path, pathname),
    );
    return matches.length === 1 ? matches[0] : undefined;
}

/** Validate the only automatic-workflow execution profile supported by the SDK. */
export function normalizePageWorkflowExecution(value: unknown): PageWorkflowExecution | undefined {
    if (!isPlainObject(value) || value.mode !== "research-and-compose") return undefined;
    if (value.availableBackendTools === undefined) return { mode: "research-and-compose" };
    if (
        !Array.isArray(value.availableBackendTools) ||
        value.availableBackendTools.length > MAX_PAGE_WORKFLOW_AVAILABLE_BACKEND_TOOLS
    ) {
        return undefined;
    }
    const seen = new Set<string>();
    const tools: PageWorkflowAvailableBackendTool[] = [];
    for (const raw of value.availableBackendTools) {
        if (!isPlainObject(raw)) return undefined;
        const connectionKey = typeof raw.connectionKey === "string" ? raw.connectionKey.trim() : "";
        const toolId = typeof raw.toolId === "string" ? raw.toolId.trim() : "";
        const contractVersion =
            typeof raw.contractVersion === "string" ? raw.contractVersion.trim() : "";
        if (
            !CONNECTION_KEY_PATTERN.test(connectionKey) ||
            !SITE_TOOL_ID_PATTERN.test(toolId) ||
            !CONTRACT_VERSION_PATTERN.test(contractVersion)
        ) {
            return undefined;
        }
        const key = `${connectionKey}\u0000${toolId}\u0000${contractVersion}`;
        if (seen.has(key)) return undefined;
        seen.add(key);
        tools.push({ connectionKey, toolId, contractVersion });
    }
    return {
        mode: "research-and-compose",
        ...(tools.length ? { availableBackendTools: tools } : {}),
    };
}

/** Validate and copy deterministic required-tool declarations. */
export function normalizeWorkflowRequirements(
    value: unknown,
    workflowPath: string,
): PageWorkflowRequiredTool[] | undefined {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > MAX_PAGE_WORKFLOW_REQUIRED_TOOLS) return undefined;
    const declaredParameters = pageWorkflowPathParameters(workflowPath);
    const seenRequirementIds = new Set<string>();
    const normalized: PageWorkflowRequiredTool[] = [];
    for (const raw of value) {
        if (!isPlainObject(raw)) return undefined;
        const id = typeof raw.id === "string" ? raw.id.trim() : "";
        const tool = normalizeWorkflowToolReference(raw.tool);
        const inputs = normalizeWorkflowInputs(raw.inputs, declaredParameters);
        const outputAssertions = normalizeWorkflowAssertions(raw.outputAssertions);
        if (
            !WORKFLOW_REQUIREMENT_ID_PATTERN.test(id) ||
            seenRequirementIds.has(id) ||
            !tool ||
            !inputs ||
            !outputAssertions
        ) {
            return undefined;
        }
        seenRequirementIds.add(id);
        normalized.push({
            id,
            tool,
            inputs,
            ...(outputAssertions.length ? { outputAssertions } : {}),
        });
    }
    return normalized;
}

export function pageWorkflowPathParameters(template: string): Set<string> {
    return new Set(
        template
            .split("/")
            .filter((segment) => segment.startsWith(":") && segment.length > 1)
            .map((segment) => segment.slice(1)),
    );
}

function normalizeWorkflowToolReference(value: unknown): WorkflowToolReference | undefined {
    if (!isPlainObject(value)) return undefined;
    const toolId = typeof value.toolId === "string" ? value.toolId.trim() : "";
    const contractVersion =
        typeof value.contractVersion === "string" ? value.contractVersion.trim() : "";
    if (!SITE_TOOL_ID_PATTERN.test(toolId) || !CONTRACT_VERSION_PATTERN.test(contractVersion))
        return undefined;
    if (value.location === "site") return { location: "site", toolId, contractVersion };
    const connectionKey = typeof value.connectionKey === "string" ? value.connectionKey.trim() : "";
    if (value.location === "backend" && CONNECTION_KEY_PATTERN.test(connectionKey)) {
        return { location: "backend", connectionKey, toolId, contractVersion };
    }
    return undefined;
}

function normalizeWorkflowInputs(
    value: unknown,
    declaredParameters: ReadonlySet<string>,
): Record<string, WorkflowInputBinding> | undefined {
    if (!isPlainObject(value)) return undefined;
    const normalized: Record<string, WorkflowInputBinding> = {};
    for (const [name, raw] of Object.entries(value)) {
        if (!name || !isPlainObject(raw)) return undefined;
        if (raw.kind === "literal" && hasOwn(raw, "value") && isJsonValue(raw.value)) {
            normalized[name] = { kind: "literal", value: raw.value };
            continue;
        }
        const parameter = typeof raw.parameter === "string" ? raw.parameter.trim() : "";
        if (raw.kind !== "path" || !parameter || !declaredParameters.has(parameter))
            return undefined;
        normalized[name] = { kind: "path", parameter };
    }
    return normalized;
}

function normalizeWorkflowAssertions(value: unknown): WorkflowOutputAssertion[] | undefined {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return undefined;
    const normalized: WorkflowOutputAssertion[] = [];
    for (const raw of value) {
        if (
            !isPlainObject(raw) ||
            typeof raw.pointer !== "string" ||
            !isRfc6901Pointer(raw.pointer)
        ) {
            return undefined;
        }
        if (raw.operator === "exists" || raw.operator === "nonEmpty") {
            normalized.push({ pointer: raw.pointer, operator: raw.operator });
        } else if (raw.operator === "equals" && hasOwn(raw, "value") && isJsonValue(raw.value)) {
            normalized.push({ pointer: raw.pointer, operator: "equals", value: raw.value });
        } else {
            return undefined;
        }
    }
    return normalized;
}

function isRfc6901Pointer(value: string): boolean {
    if (value === "") return true;
    if (!value.startsWith("/")) return false;
    for (let index = 0; index < value.length; index++) {
        if (value[index] !== "~") continue;
        const escapeCode = value[index + 1];
        if (escapeCode !== "0" && escapeCode !== "1") return false;
        index++;
    }
    return true;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
    return Object.getOwnPropertyDescriptor(value, key) !== undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value !== "object" || seen.has(value)) return false;
    seen.add(value);
    const valid = Array.isArray(value)
        ? value.every((item) => isJsonValue(item, seen))
        : Object.getPrototypeOf(value) === Object.prototype &&
          Object.entries(value).every(([key, item]) => key.length > 0 && isJsonValue(item, seen));
    seen.delete(value);
    return valid;
}
