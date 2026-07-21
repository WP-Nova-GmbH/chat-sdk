/**
 * Run `run(signal)` against a per-type timeout. On timeout the signal is aborted
 * BEFORE the promise rejects, so a cooperating handler can stop a side effect
 * instead of completing after the bridge already posted a `timeout` error.
 */
export function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
            reject({
                code: "timeout",
                message: `bridge operation timed out after ${ms}ms`,
            });
        }, ms);
        run(controller.signal).then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (err) => {
                clearTimeout(timer);
                reject(err);
            },
        );
    });
}
