import { describe, it, expect } from 'vitest';
import {
  autoShellCandidates,
  getRuntimeForLanguage,
  isShellLanguage,
  resolveShellRuntime,
} from '../../src/sandbox/runtimes.js';

describe('runtimes', () => {
  it('resolves javascript runtime', () => {
    const rt = getRuntimeForLanguage('javascript');
    expect(rt).toBeDefined();
    expect(rt?.command).toBeTruthy();
  });

  it('detects shell language aliases', () => {
    expect(isShellLanguage('shell')).toBe(true);
    expect(isShellLanguage('powershell')).toBe(true);
    expect(isShellLanguage('cmd')).toBe(true);
    expect(isShellLanguage('bash')).toBe(true);
    expect(isShellLanguage('sh')).toBe(true);
    expect(isShellLanguage('javascript')).toBe(false);
  });

  it('returns platform-specific auto shell order', () => {
    expect(autoShellCandidates('win32')).toEqual(['powershell', 'cmd', 'git-bash', 'bash', 'sh']);
    expect(autoShellCandidates('darwin')).toEqual(['zsh', 'bash', 'sh', 'powershell']);
    expect(autoShellCandidates('linux')).toEqual(['bash', 'sh', 'zsh', 'powershell']);
  });

  it('resolves shell runtime with explicit or auto preference', () => {
    const explicit = resolveShellRuntime('shell', 'bash');
    const automatic = resolveShellRuntime('shell', 'auto');

    if (explicit) {
      expect(explicit.runtimeId).toBeTruthy();
    }
    if (automatic) {
      expect(automatic.runtimeId).toBeTruthy();
    }

    // At least one shell runtime should exist on typical dev machines.
    expect(explicit || automatic).toBeDefined();
  });

  it('keeps explicit sh requests deterministic', () => {
    const rt = resolveShellRuntime('sh');
    if (rt) {
      expect(rt.runtimeId).toBe('sh');
    }
  });
});
