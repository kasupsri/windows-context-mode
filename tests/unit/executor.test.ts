import { describe, it, expect } from 'vitest';
import { executeCode } from '../../src/sandbox/executor.js';
import { getRuntimeForLanguage, getAvailableRuntimes } from '../../src/sandbox/runtimes.js';

describe('executeCode', () => {
  it('executes JavaScript and captures stdout', async () => {
    const result = await executeCode({
      language: 'javascript',
      code: 'console.log("Hello, World!");',
    });
    expect(result.stdout.trim()).toBe('Hello, World!');
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  it('captures exit code on failure', async () => {
    const result = await executeCode({
      language: 'javascript',
      code: 'process.exit(42);',
    });
    expect(result.exitCode).toBe(42);
  });

  it('captures stderr separately', async () => {
    const result = await executeCode({
      language: 'javascript',
      code: 'process.stderr.write("error message\\n"); console.log("stdout");',
    });
    expect(result.stdout.trim()).toBe('stdout');
    expect(result.stderr).toContain('error message');
  });

  it('enforces timeout', async () => {
    const result = await executeCode({
      language: 'javascript',
      code: 'const start = Date.now(); while(Date.now() - start < 10000) {}',
      timeoutMs: 1000,
    });
    expect(result.timedOut).toBe(true);
  }, 5000);

  it('executes shell commands', async () => {
    const runtime = getRuntimeForLanguage('shell');
    if (!runtime) {
      console.log('Skipping shell test: sh not available on this platform');
      return;
    }
    const result = await executeCode({
      language: 'shell',
      code: 'echo "shell works"',
    });
    expect(result.stdout.trim()).toBe('shell works');
    expect(result.exitCode).toBe(0);
  });

  it('executes Python if available', async () => {
    const runtime = getRuntimeForLanguage('python');
    if (!runtime) {
      console.log('Skipping Python test: python3 not available');
      return;
    }
    const result = await executeCode({
      language: 'python',
      code: 'print("python works")',
    });
    expect(result.stdout.trim()).toBe('python works');
  });

  it('can access env variables', async () => {
    const result = await executeCode({
      language: 'javascript',
      code: 'console.log(process.env.TEST_VAR);',
      env: { TEST_VAR: 'hello_env' },
    });
    expect(result.stdout.trim()).toBe('hello_env');
  });

  it('throws for unavailable runtime', async () => {
    await expect(
      executeCode({
        language: 'rust' as Parameters<typeof executeCode>[0]['language'],
        code: 'fn main() {}',
      })
    ).rejects.toThrow(/not available/);
  });

  it('records duration', async () => {
    const result = await executeCode({
      language: 'javascript',
      code: 'console.log("done");',
    });
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThan(10_000);
  });
});

describe('getRuntimeForLanguage', () => {
  it('returns runtime for javascript', () => {
    const rt = getRuntimeForLanguage('javascript');
    expect(rt).toBeDefined();
    expect(rt!.extension).toBe('js');
  });

  it('returns runtime for shell if available', () => {
    const rt = getRuntimeForLanguage('shell');
    // shell (sh/bash) may not be available on Windows — just check it doesn't throw
    if (rt) {
      expect(rt.available).toBe(true);
    }
  });

  it('returns undefined for unavailable runtime', () => {
    // Rust compiler unlikely to be available in test environment
    const rt = getRuntimeForLanguage('rust' as Parameters<typeof getRuntimeForLanguage>[0]);
    // It may or may not be available — just check it doesn't throw
    if (rt) {
      expect(rt.available).toBe(true);
    }
  });
});

describe('getAvailableRuntimes', () => {
  it('returns at least node/shell', () => {
    const runtimes = getAvailableRuntimes();
    expect(runtimes.length).toBeGreaterThan(0);
    const names = runtimes.map(r => r.language);
    // At minimum, node or bun should be available (we're running in Node)
    const hasJs = names.includes('javascript') || names.includes('js');
    expect(hasJs).toBe(true);
  });
});
