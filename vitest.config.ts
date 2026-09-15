import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The npm `obsidian` package is types-only; alias it to a runtime stub.
      obsidian: fileURLToPath(new URL('./tests/__stubs__/obsidian.ts', import.meta.url))
    }
  }
});
