// --- Size budget (mirrors the POC's FIELD_VALUE_CAP / MARKDOWN_CAP) ----------

/** Max number of stable handles issued per capture. */
export const MAX_HANDLES = 200;
/** Max normalized rendered-text characters carried in the snapshot. */
export const VISIBLE_TEXT_CAP = 200_000;
/** Per-captured-field value cap (chars). */
export const FIELD_VALUE_CAP = 500;
/** Max visible links carried in the snapshot. */
export const MAX_LINKS = 100;
/** Max visible controls carried in the snapshot. */
export const MAX_CONTROLS = 100;
/** Max omitted/blurred field-value metadata entries carried in the snapshot. */
export const MAX_OMITTED_VALUES = 100;
/** Max nearby target-context characters carried per visible control/link. */
export const TARGET_CONTEXT_CAP = 160;
/** Max ancestor levels searched for a semantic target context container. */
export const TARGET_CONTEXT_DEPTH = 8;
/** Attribute stamped on captured elements; the handle id. */
export const HANDLE_ATTR = "data-wp-nova-h";
/** Opt-in attribute that allows a field value to be captured (on it or an ancestor). */
export const INCLUDE_ATTR = "data-wp-nova-include";
/** Opt-out attribute: the element and its subtree are excluded entirely. */
export const IGNORE_ATTR = "data-wp-nova-ignore";

/** Field names / ids / labels that hard-exclude a value regardless of opt-in. */
export const SENSITIVE_NAME_RE = /(card|cc|cvv|cvc|ssn|secret|token|password|account|iban|routing|pin)/i;
/** Input types whose values are never captured. */
export const HARD_EXCLUDE_INPUT_TYPES = new Set(["password", "hidden", "file"]);
/** autocomplete tokens that hard-exclude a value (cc-* handled by prefix). */
export const HARD_EXCLUDE_AUTOCOMPLETE = new Set(["current-password", "new-password", "one-time-code"]);

/** Tags treated as interactive controls. */
export const CONTROL_TAGS = new Set(["button", "input", "select", "textarea"]);
/** Controls whose values are governed by the default-deny field-value policy. */
export const VALUE_FIELD_TAGS = new Set(["input", "select", "textarea"]);
/** Ancestor tags that usually name a row/list/card-like target. */
export const CONTEXT_CONTAINER_TAGS = new Set(["tr", "li", "article", "section"]);
/** Ancestor roles that usually name a row/list/card-like target. */
export const CONTEXT_CONTAINER_ROLES = new Set(["row", "listitem", "article", "region", "group"]);
/** Common non-semantic card/list container hints used by many host apps. */
export const CONTEXT_CONTAINER_HINT_RE = /\b(card|tile|record|row|item|list-item)\b/i;
