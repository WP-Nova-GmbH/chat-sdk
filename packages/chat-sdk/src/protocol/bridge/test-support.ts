const ORIGINAL_WINDOW = Object.getOwnPropertyDescriptor(globalThis, "window");
export const ORIGINAL_SET_TIMEOUT = Object.getOwnPropertyDescriptor(globalThis, "setTimeout");

export function restoreWindow(): void {
    if (ORIGINAL_WINDOW) {
        Object.defineProperty(globalThis, "window", ORIGINAL_WINDOW);
    } else {
        Reflect.deleteProperty(globalThis, "window");
    }
}

export function installWindow(onListener: (cb: (event: MessageEvent) => void) => void): void {
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
            addEventListener(_type: string, cb: (event: MessageEvent) => void) {
                onListener(cb);
            },
            removeEventListener() {
                onListener(() => undefined);
            },
        },
    });
}

export const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
