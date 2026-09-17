// Minimal runtime stub for the types-only `obsidian` npm package.
// Vitest aliases `obsidian` to this file (see vitest.config.ts) so that
// modules importing Obsidian classes at runtime resolve during tests.
// Only members used by the tested module graph are provided.

export class App {}

export class TFile {
  path = '';
}

export class TFolder {
  path = '';
}

export function debounce<A extends unknown[], R>(
  fn: (...args: A) => R,
  _timeout?: number,
  _resetTimer?: boolean
): ((...args: A) => R) & { cancel(): void; run(...args: A): void } {
  const wrapped = ((...args: A) => fn(...args)) as ((...args: A) => R) & {
    cancel(): void;
    run(...args: A): void;
  };
  wrapped.cancel = () => {};
  wrapped.run = (...args: A) => {
    fn(...args);
  };
  return wrapped;
}

export const Platform = {
  isMobile: false,
  isDesktop: true,
  isIosApp: false,
  isAndroidApp: false,
  isMacOS: false,
  isWin: true,
  isLinux: false,
};
