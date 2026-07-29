import type { PageWorkflowDefinition } from "../protocol/types/index.js";

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
