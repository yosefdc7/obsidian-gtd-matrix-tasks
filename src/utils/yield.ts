/**
 * Yields execution to the JavaScript event loop cooperatively.
 * Uses requestIdleCallback with a timeout when available (browser/mobile webview),
 * falling back to setTimeout(..., 0) in Node.js or older environments.
 *
 * @param timeoutMs Maximum deadline wait in milliseconds before forced execution (default: 50ms)
 */
export function yieldCooperative(timeoutMs: number = 50): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
      (window as any).requestIdleCallback(() => resolve(), { timeout: timeoutMs });
    } else {
      setTimeout(resolve, 0);
    }
  });
}
