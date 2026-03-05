import { DEFAULT_CONFIG, type ContextModeConfig } from './defaults.js';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const LOG_LEVELS: ReadonlySet<ContextModeConfig['logging']['level']> = new Set([
  'debug',
  'info',
  'warn',
  'error',
]);
const SHELL_RUNTIMES: ReadonlySet<ContextModeConfig['sandbox']['shellDefault']> = new Set([
  'auto',
  'powershell',
  'cmd',
  'git-bash',
  'bash',
  'zsh',
  'sh',
]);

function asObject(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

export function parseConfig(input: unknown): ContextModeConfig {
  const partial = (asObject(input) ?? {}) as DeepPartial<ContextModeConfig>;

  return {
    compression: {
      ...DEFAULT_CONFIG.compression,
      ...(partial.compression ?? {}),
    },
    sandbox: {
      ...DEFAULT_CONFIG.sandbox,
      ...(partial.sandbox ?? {}),
    },
    security: {
      ...DEFAULT_CONFIG.security,
      ...(partial.security ?? {}),
    },
    knowledgeBase: {
      ...DEFAULT_CONFIG.knowledgeBase,
      ...(partial.knowledgeBase ?? {}),
    },
    logging: {
      ...DEFAULT_CONFIG.logging,
      ...(partial.logging ?? {}),
    },
    stats: {
      ...DEFAULT_CONFIG.stats,
      ...(partial.stats ?? {}),
    },
  };
}

export function loadConfigFromEnv(): DeepPartial<ContextModeConfig> {
  const config: DeepPartial<ContextModeConfig> = {};

  const maxOutputBytes = parsePositiveInt(process.env['CMU_MAX_OUTPUT_BYTES']);
  if (maxOutputBytes !== undefined) {
    config.compression = config.compression ?? {};
    config.compression.maxOutputBytes = maxOutputBytes;
  }

  const timeoutMs = parsePositiveInt(process.env['CMU_TIMEOUT_MS']);
  if (timeoutMs !== undefined) {
    config.sandbox = config.sandbox ?? {};
    config.sandbox.timeoutMs = timeoutMs;
  }

  const memoryMB = parsePositiveInt(process.env['CMU_MEMORY_MB']);
  if (memoryMB !== undefined) {
    config.sandbox = config.sandbox ?? {};
    config.sandbox.memoryMB = memoryMB;
  }

  const maxFileBytes = parsePositiveInt(process.env['CMU_MAX_FILE_BYTES']);
  if (maxFileBytes !== undefined) {
    config.sandbox = config.sandbox ?? {};
    config.sandbox.maxFileBytes = maxFileBytes;
  }

  const allowAuthPassthrough = parseBoolean(process.env['CMU_ALLOW_AUTH_PASSTHROUGH']);
  if (allowAuthPassthrough !== undefined) {
    config.sandbox = config.sandbox ?? {};
    config.sandbox.allowAuthPassthrough = allowAuthPassthrough;
  }

  if (process.env['CMU_SHELL']) {
    config.sandbox = config.sandbox ?? {};
    const shell = process.env['CMU_SHELL'];
    if (shell && SHELL_RUNTIMES.has(shell as ContextModeConfig['sandbox']['shellDefault'])) {
      config.sandbox.shellDefault = shell as ContextModeConfig['sandbox']['shellDefault'];
    }
  }

  if (process.env['CMU_POLICY_MODE']) {
    config.security = config.security ?? {};
    const mode = process.env['CMU_POLICY_MODE'];
    if (mode === 'strict' || mode === 'balanced' || mode === 'permissive') {
      config.security.policyMode = mode;
    }
  }

  const allowPrivateNetworkFetch = parseBoolean(process.env['CMU_ALLOW_PRIVATE_NETWORK_FETCH']);
  if (allowPrivateNetworkFetch !== undefined) {
    config.security = config.security ?? {};
    config.security.allowPrivateNetworkFetch = allowPrivateNetworkFetch;
  }

  if (process.env['CMU_DB_PATH']) {
    config.knowledgeBase = config.knowledgeBase ?? {};
    config.knowledgeBase.dbPath = process.env['CMU_DB_PATH'];
  }

  const searchTopK = parsePositiveInt(process.env['CMU_SEARCH_TOP_K']);
  if (searchTopK !== undefined) {
    config.knowledgeBase = config.knowledgeBase ?? {};
    config.knowledgeBase.searchTopK = searchTopK;
  }

  const maxFetchBytes = parsePositiveInt(process.env['CMU_MAX_FETCH_BYTES']);
  if (maxFetchBytes !== undefined) {
    config.knowledgeBase = config.knowledgeBase ?? {};
    config.knowledgeBase.maxFetchBytes = maxFetchBytes;
  }

  if (process.env['CMU_STATS_EXPORT_PATH']) {
    config.stats = config.stats ?? {};
    config.stats.exportPath = process.env['CMU_STATS_EXPORT_PATH'];
  }

  const maxEvents = parsePositiveInt(process.env['CMU_STATS_MAX_EVENTS']);
  if (maxEvents !== undefined) {
    config.stats = config.stats ?? {};
    config.stats.maxEvents = maxEvents;
  }

  if (process.env['LOG_LEVEL']) {
    const level = process.env['LOG_LEVEL'] as ContextModeConfig['logging']['level'];
    if (LOG_LEVELS.has(level)) {
      config.logging = { level };
    }
  }

  return config;
}
