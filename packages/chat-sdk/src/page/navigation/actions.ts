/** Built-in navigation action names the SDK can execute itself (no host handler). */
export const NAVIGATION_ACTIONS = [
    "refresh_context",
    "navigate",
    "click",
    "open_record",
    "set_filter",
    "scroll_to",
    "highlight",
] as const;

export type NavigationAction = (typeof NAVIGATION_ACTIONS)[number];

/** True when `name` is a built-in navigation action (vs an integrator tool). */
export function isNavigationAction(name: string): name is NavigationAction {
    return (NAVIGATION_ACTIONS as readonly string[]).includes(name);
}
