import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', exclude: [...configDefaults.exclude, '2026-11-04-codex-empty-test/**'], coverage: { reporter: ['text', 'html'] } },
});
