import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';
import { loadConfigFromEnv, parseConfig } from '../../src/config/schema.js';

const ENV_KEYS = [
  'CMU_TIMEOUT_MS',
  'CMU_MAX_FILE_BYTES',
  'CMU_ALLOW_AUTH_PASSTHROUGH',
  'CMU_MAX_FETCH_BYTES',
  'CMU_SHELL',
  'LOG_LEVEL',
] as const;

const originalEnv: Record<string, string | undefined> = Object.fromEntries(
  ENV_KEYS.map(key => [key, process.env[key]])
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('config schema', () => {
  it('parses validated environment values', () => {
    process.env['CMU_TIMEOUT_MS'] = '45000';
    process.env['CMU_MAX_FILE_BYTES'] = '2048';
    process.env['CMU_ALLOW_AUTH_PASSTHROUGH'] = 'true';
    process.env['CMU_MAX_FETCH_BYTES'] = '1048576';
    process.env['CMU_SHELL'] = 'auto';
    process.env['LOG_LEVEL'] = 'warn';

    const cfg = loadConfigFromEnv();

    expect(cfg.sandbox?.timeoutMs).toBe(45000);
    expect(cfg.sandbox?.maxFileBytes).toBe(2048);
    expect(cfg.sandbox?.allowAuthPassthrough).toBe(true);
    expect(cfg.sandbox?.shellDefault).toBe('auto');
    expect(cfg.knowledgeBase?.maxFetchBytes).toBe(1048576);
    expect(cfg.logging?.level).toBe('warn');
  });

  it('ignores invalid numeric and enum values', () => {
    process.env['CMU_TIMEOUT_MS'] = '-5';
    process.env['CMU_MAX_FILE_BYTES'] = 'not-a-number';
    process.env['CMU_SHELL'] = 'fish';
    process.env['LOG_LEVEL'] = 'verbose';

    const cfg = loadConfigFromEnv();

    expect(cfg.sandbox?.timeoutMs).toBeUndefined();
    expect(cfg.sandbox?.maxFileBytes).toBeUndefined();
    expect(cfg.sandbox?.shellDefault).toBeUndefined();
    expect(cfg.logging).toBeUndefined();
  });

  it('returns a cloned default config for invalid input', () => {
    const parsed = parseConfig(undefined);
    const originalTimeout = DEFAULT_CONFIG.sandbox.timeoutMs;

    expect(parsed).toEqual(DEFAULT_CONFIG);
    parsed.sandbox.timeoutMs = originalTimeout + 1;
    expect(DEFAULT_CONFIG.sandbox.timeoutMs).toBe(originalTimeout);
  });
});
