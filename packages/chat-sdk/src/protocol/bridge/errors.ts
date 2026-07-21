import type { BridgeErrorCode } from "../types/index.js";

/** A typed error carrying a `code` the bridge maps onto a `*_ERROR` frame. */
export interface CodedError {
    code: BridgeErrorCode;
    message: string;
}

export function toCodedError(err: unknown): CodedError {
    const code = (err as { code?: unknown })?.code;
    const rawMessage = (err as { message?: unknown })?.message;
    const message =
        typeof rawMessage === "string"
            ? rawMessage
            : err instanceof Error
              ? err.message
              : String(err);
    if (
        code === "no_handler" ||
        code === "stale_handle" ||
        code === "capture_error" ||
        code === "handler_threw" ||
        code === "timeout"
    ) {
        return { code, message };
    }
    return { code: "handler_threw", message };
}
