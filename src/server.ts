import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { executeTool } from './tools/execute.js';
import { executeFileTool } from './tools/execute-file.js';
import { indexContentTool } from './tools/index-content.js';
import { searchTool } from './tools/search.js';
import { fetchAndIndexTool } from './tools/fetch-and-index.js';
import { compressTool } from './tools/compress.js';
import { proxyTool } from './tools/proxy-tool.js';
import { statsGetTool } from './tools/stats-get.js';
import { statsResetTool } from './tools/stats-reset.js';
import { statsExportTool } from './tools/stats-export.js';
import { doctorTool } from './tools/doctor.js';
import { readSymbolsTool } from './tools/read-symbols.js';
import { readReferencesTool } from './tools/read-references.js';
import { diagnosticsFocusTool } from './tools/diagnostics-focus.js';
import { gitFocusTool } from './tools/git-focus.js';
import { logger } from './utils/logger.js';
import { optimizeResponse } from './compression/response-optimizer.js';
import { statsTracker } from './utils/stats-tracker.js';
import { type CompressionStrategy } from './compression/strategies.js';
import { DEFAULT_CONFIG, type ResponseMode } from './config/defaults.js';

const TOOLS: Tool[] = [
  {
    name: 'execute',
    description:
      'Execute code in a sandboxed subprocess. Shell runtime resolution is cross-platform with OS-aware defaults and strict safety checks before execution.',
    inputSchema: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: [
            'javascript',
            'js',
            'typescript',
            'ts',
            'python',
            'py',
            'shell',
            'powershell',
            'cmd',
            'bash',
            'sh',
            'ruby',
            'rb',
            'go',
            'rust',
            'rs',
            'php',
            'perl',
            'pl',
            'r',
          ],
        },
        code: { type: 'string' },
        intent: { type: 'string' },
        timeout: { type: 'number' },
        max_output_tokens: { type: 'number' },
        shell_runtime: {
          type: 'string',
          enum: ['auto', 'powershell', 'cmd', 'git-bash', 'bash', 'zsh', 'sh'],
        },
      },
      required: ['language', 'code'],
    },
  },
  {
    name: 'execute_file',
    description:
      'Process a file in a sandboxed JavaScript runtime. File path deny rules are enforced before execution.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        code: { type: 'string' },
        intent: { type: 'string' },
        timeout: { type: 'number' },
        max_output_tokens: { type: 'number' },
      },
      required: ['file_path', 'code'],
    },
  },
  {
    name: 'index',
    description: 'Index markdown/text content into BM25-searchable chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        source: { type: 'string' },
        kb_name: { type: 'string' },
        chunk_size: { type: 'number' },
        max_output_tokens: { type: 'number' },
      },
      required: ['content'],
    },
  },
  {
    name: 'search',
    description: 'Search indexed knowledge base content.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        kb_name: { type: 'string' },
        top_k: { type: 'number' },
        max_output_tokens: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_and_index',
    description: 'Fetch a URL, convert to markdown/text, and index for search.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        kb_name: { type: 'string' },
        chunk_size: { type: 'number' },
        max_output_tokens: { type: 'number' },
      },
      required: ['url'],
    },
  },
  {
    name: 'compress',
    description: 'Compress large content by content-type-aware algorithmic strategies.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        intent: { type: 'string' },
        strategy: { type: 'string', enum: ['auto', 'truncate', 'summarize', 'filter', 'ultra'] },
        max_output_tokens: { type: 'number' },
      },
      required: ['content'],
    },
  },
  {
    name: 'proxy',
    description: 'Proxy common tool-like actions and compress output before returning to context.',
    inputSchema: {
      type: 'object',
      properties: {
        tool: { type: 'string' },
        args: { type: 'object' },
        intent: { type: 'string' },
        strategy: { type: 'string', enum: ['auto', 'truncate', 'summarize', 'filter', 'ultra'] },
        max_output_tokens: { type: 'number' },
      },
      required: ['tool', 'args'],
    },
  },
  {
    name: 'stats_get',
    description: 'Show session token/context savings and per-tool breakdown.',
    inputSchema: {
      type: 'object',
      properties: {
        max_output_tokens: { type: 'number' },
      },
    },
  },
  {
    name: 'stats_reset',
    description: 'Reset in-memory session compression statistics.',
    inputSchema: {
      type: 'object',
      properties: {
        max_output_tokens: { type: 'number' },
      },
    },
  },
  {
    name: 'stats_export',
    description: 'Export session stats JSON to a file (default: OS temp directory).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        max_output_tokens: { type: 'number' },
      },
    },
  },
  {
    name: 'doctor',
    description: 'Run local diagnostics for runtime resolution, policy mode, and safety checks.',
    inputSchema: {
      type: 'object',
      properties: {
        max_output_tokens: { type: 'number' },
      },
    },
  },
  {
    name: 'read_symbols',
    description: 'Return compact symbol inventory (functions/classes/types) for a source file.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        query: { type: 'string' },
        kind: {
          type: 'string',
          enum: [
            'all',
            'function',
            'class',
            'interface',
            'type',
            'enum',
            'const',
            'method',
            'struct',
            'trait',
          ],
        },
        max_symbols: { type: 'number' },
        include_line_numbers: { type: 'boolean' },
        max_output_tokens: { type: 'number' },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_references',
    description:
      'Return query-focused reference snippets for a symbol from file path or cached context_id.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        context_id: { type: 'string' },
        symbol: { type: 'string' },
        context_lines: { type: 'number' },
        max_matches: { type: 'number' },
        include_line_numbers: { type: 'boolean' },
        case_sensitive: { type: 'boolean' },
        whole_word: { type: 'boolean' },
        max_output_tokens: { type: 'number' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'diagnostics_focus',
    description: 'Normalize noisy build/lint/test logs into deduplicated error summaries.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        format: { type: 'string', enum: ['auto', 'tsc', 'eslint', 'vitest', 'jest', 'generic'] },
        max_items: { type: 'number' },
        include_examples: { type: 'boolean' },
        max_output_tokens: { type: 'number' },
      },
      required: ['content'],
    },
  },
  {
    name: 'git_focus',
    description: 'Summarize changed files, symbols, and minimal hunks from git diff.',
    inputSchema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string' },
        base_ref: { type: 'string' },
        scope: { type: 'string', enum: ['working', 'staged', 'unstaged'] },
        max_files: { type: 'number' },
        max_hunks_per_file: { type: 'number' },
        include_hunks: { type: 'boolean' },
        max_output_tokens: { type: 'number' },
      },
    },
  },
];

interface SchemaProperty {
  type?: string;
  enum?: string[];
}

interface ToolSchema {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

const RESPONSE_MODES: ReadonlySet<ResponseMode> = new Set(['minimal', 'full']);

for (const tool of TOOLS) {
  const schema = tool.inputSchema as ToolSchema;
  schema.properties = schema.properties ?? {};
  schema.properties['max_output_tokens'] = schema.properties['max_output_tokens'] ?? {
    type: 'number',
  };
  schema.properties['response_mode'] = {
    type: 'string',
    enum: ['minimal', 'full'],
  };
  if (tool.name === 'search') {
    schema.properties['compact'] = { type: 'boolean' };
  }
}

const TOOL_BY_NAME = new Map(TOOLS.map(tool => [tool.name, tool]));

const OPTIMIZATION_STRATEGIES: ReadonlySet<CompressionStrategy> = new Set([
  'auto',
  'truncate',
  'summarize',
  'filter',
  'ultra',
  'as-is',
]);
const ULTRA_FIRST_TOOLS = new Set([
  'search',
  'index',
  'fetch_and_index',
  'doctor',
  'stats_get',
  'stats_reset',
  'stats_export',
  'read_symbols',
  'read_references',
  'diagnostics_focus',
  'git_focus',
]);

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function resolveRequestedMaxOutputTokens(rawValue: unknown): number {
  const configuredDefault = DEFAULT_CONFIG.compression.defaultMaxOutputTokens;
  const configuredHard = DEFAULT_CONFIG.compression.hardMaxOutputTokens;
  const defaultTokens =
    Number.isFinite(configuredDefault) && configuredDefault > 0
      ? Math.floor(configuredDefault)
      : 400;
  const hardCap =
    Number.isFinite(configuredHard) && configuredHard > 0 ? Math.floor(configuredHard) : 800;
  const requested =
    typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0
      ? Math.floor(rawValue)
      : defaultTokens;
  return Math.max(1, Math.min(requested, hardCap));
}

function resolveResponseMode(rawValue: unknown): ResponseMode {
  if (typeof rawValue === 'string' && RESPONSE_MODES.has(rawValue as ResponseMode)) {
    return rawValue as ResponseMode;
  }
  return DEFAULT_CONFIG.compression.responseMode;
}

function getOptimizationHints(args: unknown): {
  intent?: string;
  maxOutputTokens: number;
  preferredStrategy?: CompressionStrategy;
  responseMode: ResponseMode;
} {
  const parsed = asObject(args);
  const rawIntent = parsed['intent'];
  const rawStrategy = parsed['strategy'];
  const rawMode = parsed['response_mode'];

  const intent = typeof rawIntent === 'string' && rawIntent.trim() ? rawIntent : undefined;
  const maxOutputTokens = resolveRequestedMaxOutputTokens(parsed['max_output_tokens']);
  const preferredStrategy =
    typeof rawStrategy === 'string' &&
    OPTIMIZATION_STRATEGIES.has(rawStrategy as CompressionStrategy)
      ? (rawStrategy as CompressionStrategy)
      : undefined;
  const responseMode = resolveResponseMode(rawMode);

  return { intent, maxOutputTokens, preferredStrategy, responseMode };
}

function shouldRecordStats(toolName: string): boolean {
  return toolName !== 'stats_get' && toolName !== 'stats_reset';
}

function validateToolArguments(tool: Tool, args: unknown): string | null {
  const schema = tool.inputSchema as ToolSchema;
  const required = schema.required ?? [];
  const properties = schema.properties ?? {};

  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    return `Invalid arguments for "${tool.name}": expected an object`;
  }

  const parsedArgs = (args ?? {}) as Record<string, unknown>;

  for (const key of Object.keys(parsedArgs)) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) {
      return `Unknown argument "${key}" for tool "${tool.name}"`;
    }
  }

  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(parsedArgs, key)) {
      return `Missing required argument "${key}" for tool "${tool.name}"`;
    }
    const value = parsedArgs[key];
    if (value === undefined || value === null) {
      return `Argument "${key}" cannot be null or undefined for tool "${tool.name}"`;
    }
  }

  for (const [key, property] of Object.entries(properties)) {
    if (!Object.prototype.hasOwnProperty.call(parsedArgs, key)) {
      continue;
    }

    const value = parsedArgs[key];
    if (value === undefined || value === null) {
      continue;
    }

    if (property.type === 'string' && typeof value !== 'string') {
      return `Invalid argument type for "${key}" in tool "${tool.name}": expected string`;
    }

    if (property.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      return `Invalid argument type for "${key}" in tool "${tool.name}": expected number`;
    }

    if (property.type === 'boolean' && typeof value !== 'boolean') {
      return `Invalid argument type for "${key}" in tool "${tool.name}": expected boolean`;
    }

    if (
      property.type === 'object' &&
      (typeof value !== 'object' || value === null || Array.isArray(value))
    ) {
      return `Invalid argument type for "${key}" in tool "${tool.name}": expected object`;
    }

    if (property.type === 'array' && !Array.isArray(value)) {
      return `Invalid argument type for "${key}" in tool "${tool.name}": expected array`;
    }

    if (property.type === 'number' && typeof value === 'number' && value <= 0) {
      return `Invalid argument value for "${key}" in tool "${tool.name}": expected positive number`;
    }

    if (property.enum && typeof value === 'string' && !property.enum.includes(value)) {
      return `Invalid value for "${key}" in tool "${tool.name}": expected one of ${property.enum.join(', ')}`;
    }
  }

  return null;
}

export function createServer(): { server: Server; transport: StdioServerTransport } {
  const server = new Server(
    {
      name: 'context-mode-universal',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, () => Promise.resolve({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;
    logger.debug('Tool called', { name, args });
    const toolName = typeof name === 'string' ? name : 'unknown';
    const hints = getOptimizationHints(args);
    const preferredStrategy =
      hints.preferredStrategy ??
      (hints.responseMode === 'minimal' && ULTRA_FIRST_TOOLS.has(toolName) ? 'ultra' : undefined);

    try {
      const tool = TOOL_BY_NAME.get(toolName);
      if (!tool) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      const validationError = validateToolArguments(tool, args);
      if (validationError) {
        throw new Error(validationError);
      }

      let result: string;
      const typedArgs: unknown = args ?? {};

      switch (toolName) {
        case 'execute':
          result = await executeTool(typedArgs as Parameters<typeof executeTool>[0]);
          break;
        case 'execute_file':
          result = await executeFileTool(typedArgs as Parameters<typeof executeFileTool>[0]);
          break;
        case 'index':
          result = await indexContentTool(typedArgs as Parameters<typeof indexContentTool>[0]);
          break;
        case 'search':
          result = await searchTool(typedArgs as Parameters<typeof searchTool>[0]);
          break;
        case 'fetch_and_index':
          result = await fetchAndIndexTool(typedArgs as Parameters<typeof fetchAndIndexTool>[0]);
          break;
        case 'compress':
          result = compressTool(typedArgs as Parameters<typeof compressTool>[0]);
          break;
        case 'proxy':
          result = await proxyTool(typedArgs as Parameters<typeof proxyTool>[0]);
          break;
        case 'stats_get':
          result = statsGetTool(typedArgs as Parameters<typeof statsGetTool>[0]);
          break;
        case 'stats_reset':
          result = statsResetTool(typedArgs as Parameters<typeof statsResetTool>[0]);
          break;
        case 'stats_export':
          result = await statsExportTool(typedArgs as Parameters<typeof statsExportTool>[0]);
          break;
        case 'doctor':
          result = doctorTool(typedArgs as Parameters<typeof doctorTool>[0]);
          break;
        case 'read_symbols':
          result = await readSymbolsTool(typedArgs as Parameters<typeof readSymbolsTool>[0]);
          break;
        case 'read_references':
          result = await readReferencesTool(typedArgs as Parameters<typeof readReferencesTool>[0]);
          break;
        case 'diagnostics_focus':
          result = diagnosticsFocusTool(typedArgs as Parameters<typeof diagnosticsFocusTool>[0]);
          break;
        case 'git_focus':
          result = await gitFocusTool(typedArgs as Parameters<typeof gitFocusTool>[0]);
          break;
        default:
          throw new Error(`Unhandled tool: ${toolName}`);
      }

      const optimized = optimizeResponse(result, {
        intent: hints.intent,
        maxOutputTokens: hints.maxOutputTokens,
        preferredStrategy,
        responseMode: hints.responseMode,
        toolName,
        isError: false,
      });

      if (shouldRecordStats(toolName)) {
        statsTracker.record(toolName, result, optimized.output, optimized.chosenStrategy, {
          changed: optimized.changed,
          budgetForced: optimized.budgetForced,
          candidateCount: optimized.candidates.length,
        });
      }

      logger.debug('Tool completed', {
        name: toolName,
        outputLength: optimized.output.length,
        strategy: optimized.chosenStrategy,
      });

      return {
        content: [{ type: 'text', text: optimized.output }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const rawErrorText = `Error: ${message}`;
      const optimized = optimizeResponse(rawErrorText, {
        intent: hints.intent,
        maxOutputTokens: hints.maxOutputTokens,
        preferredStrategy,
        responseMode: hints.responseMode,
        toolName,
        isError: true,
      });

      if (shouldRecordStats(toolName)) {
        statsTracker.record(
          `${toolName}:error`,
          rawErrorText,
          optimized.output,
          optimized.chosenStrategy,
          {
            changed: optimized.changed,
            budgetForced: optimized.budgetForced,
            candidateCount: optimized.candidates.length,
          }
        );
      }

      logger.error('Tool error', { name: toolName, error: message });
      return {
        content: [{ type: 'text', text: optimized.output }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  return { server, transport };
}
