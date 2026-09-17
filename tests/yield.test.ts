import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { yieldCooperative } from '../src/utils/yield';

describe('yieldCooperative', () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    if (originalWindow !== undefined) {
      (globalThis as any).window = originalWindow;
    } else {
      delete (globalThis as any).window;
    }
    vi.restoreAllMocks();
  });

  it('resolves successfully in Node/mock environment via setTimeout fallback when window is undefined', async () => {
    delete (globalThis as any).window;
    let resolved = false;
    const promise = yieldCooperative().then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    await promise;
    expect(resolved).toBe(true);
  });

  it('resolves via setTimeout fallback when window is present but requestIdleCallback is undefined', async () => {
    (globalThis as any).window = {};
    let resolved = false;
    const promise = yieldCooperative().then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    await promise;
    expect(resolved).toBe(true);
  });

  it('resolves when mock requestIdleCallback is present on window', async () => {
    const mockRequestIdleCallback = vi.fn((cb: () => void) => {
      setTimeout(cb, 0);
      return 1;
    });
    (globalThis as any).window = {
      requestIdleCallback: mockRequestIdleCallback,
    };

    await yieldCooperative();
    expect(mockRequestIdleCallback).toHaveBeenCalledTimes(1);
    expect(mockRequestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 50 });
  });

  it('respects custom timeoutMs parameter', async () => {
    const mockRequestIdleCallback = vi.fn((cb: () => void) => {
      setTimeout(cb, 0);
      return 1;
    });
    (globalThis as any).window = {
      requestIdleCallback: mockRequestIdleCallback,
    };

    await yieldCooperative(120);
    expect(mockRequestIdleCallback).toHaveBeenCalledTimes(1);
    expect(mockRequestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 120 });
  });
});
