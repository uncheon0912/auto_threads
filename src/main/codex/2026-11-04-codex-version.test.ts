import { describe, expect, it } from 'vitest';
import { compareCodexVersions } from './runner';

describe('Codex executable version selection', () => {
  it('prefers newer versions and handles prerelease versions', () => {
    expect(compareCodexVersions('codex-cli 0.166.0-alpha.6', 'codex-cli 0.130.0-alpha.5')).toBeGreaterThan(0);
    expect(compareCodexVersions('0.166.0', '0.166.0-alpha.6')).toBeGreaterThan(0);
    expect(compareCodexVersions('0.166.0-alpha.12', '0.166.0-alpha.6')).toBeGreaterThan(0);
    expect(compareCodexVersions('', '0.166.0')).toBeLessThan(0);
  });
});
