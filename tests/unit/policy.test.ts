import { describe, it, expect } from 'vitest';
import {
  evaluateCommand,
  evaluateFilePath,
  extractShellCommands,
  splitChainedCommands,
} from '../../src/security/policy.js';
import { policyByMode } from '../../src/security/default-rules.js';

describe('policy splitChainedCommands', () => {
  it('splits chained shell commands', () => {
    const parts = splitChainedCommands('echo ok && Remove-Item -Recurse -Force C:\\temp ; dir');
    expect(parts.length).toBe(3);
    expect(parts[1]).toContain('Remove-Item');
  });
});

describe('policy evaluateCommand', () => {
  it('denies destructive strict Windows command', () => {
    const windowsPolicy = policyByMode('strict', 'win32');
    const decision = evaluateCommand('Remove-Item -Recurse -Force C:\\temp\\x', windowsPolicy);
    expect(decision.decision).toBe('deny');
  });

  it('denies destructive strict POSIX command', () => {
    const posixPolicy = policyByMode('strict', 'linux');
    const decision = evaluateCommand('rm -rf /tmp/sandbox', posixPolicy);
    expect(decision.decision).toBe('deny');
  });

  it('asks for dangerous balanced POSIX command', () => {
    const posixPolicy = policyByMode('balanced', 'darwin');
    const decision = evaluateCommand('rm -rf /tmp/sandbox', posixPolicy);
    expect(decision.decision).toBe('ask');
  });

  it('allows normal read-only command', () => {
    const decision = evaluateCommand('Get-ChildItem .');
    expect(['allow', 'ask']).toContain(decision.decision);
  });
});

describe('policy evaluateFilePath', () => {
  it('denies .env paths', () => {
    const evalResult = evaluateFilePath('C:\\repo\\.env');
    expect(evalResult.denied).toBe(true);
  });
});

describe('policy extractShellCommands', () => {
  it('finds embedded shell exec in JavaScript', () => {
    const cmds = extractShellCommands('execSync("del /s /q C:\\\\tmp\\\\*")', 'javascript');
    expect(cmds.length).toBeGreaterThan(0);
    expect(cmds[0]).toContain('del /s /q');
  });
});
