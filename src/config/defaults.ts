export interface ContextModeConfig {
  compression: {
    maxOutputBytes: number; // Target max output size
    defaultStrategy: 'auto' | 'truncate' | 'summarize' | 'filter';
    headLines: number; // Lines to keep from start (generic truncate)
    tailLines: number; // Lines to keep from end (generic truncate)
  };
  sandbox: {
    timeoutMs: number;
    memoryMB: number;
    preferBun: boolean;
    shellDefault: 'auto' | 'powershell' | 'cmd' | 'git-bash' | 'bash' | 'zsh' | 'sh';
    allowAuthPassthrough: boolean;
    maxFileBytes: number;
  };
  security: {
    policyMode: 'strict' | 'balanced' | 'permissive';
    allowPrivateNetworkFetch: boolean;
  };
  knowledgeBase: {
    dbPath: string; // Will be set to OS temp by default
    maxChunkSize: number; // Max chars per chunk
    chunkOverlap: number; // Overlap between chunks
    searchTopK: number; // Default search results
    maxFetchBytes: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
  };
  stats: {
    exportPath?: string;
    maxEvents: number;
  };
}

import { tmpdir } from 'os';
import { join } from 'path';

export const DEFAULT_CONFIG: ContextModeConfig = {
  compression: {
    maxOutputBytes: 8 * 1024, // 8KB target output
    defaultStrategy: 'auto',
    headLines: 50,
    tailLines: 20,
  },
  sandbox: {
    timeoutMs: 30_000,
    memoryMB: 256,
    preferBun: true,
    shellDefault: 'auto',
    allowAuthPassthrough: false,
    maxFileBytes: 1 * 1024 * 1024, // 1MB
  },
  security: {
    policyMode: 'strict',
    allowPrivateNetworkFetch: false,
  },
  knowledgeBase: {
    dbPath: join(tmpdir(), 'context-mode-universal.db'),
    maxChunkSize: 1500,
    chunkOverlap: 100,
    searchTopK: 5,
    maxFetchBytes: 5 * 1024 * 1024, // 5MB
  },
  logging: {
    level: 'info',
  },
  stats: {
    maxEvents: 1000,
  },
};
