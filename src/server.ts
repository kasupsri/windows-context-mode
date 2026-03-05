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
import { logger } from './utils/logger.js';
import { optimizeResponse } from './compression/response-optimizer.js';
import { statsTracker } from './utils/stats-tracker.js';
import { type CompressionStrategy } from './compression/strategies.js';

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
        strategy: { type: 'string', enum: ['auto', 'truncate', 'summarize', 'filter'] },
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
        strategy: { type: 'string', enum: ['auto', 'truncate', 'summarize', 'filter'] },
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
];

interface SchemaProperty {
  type?: string;
  enum?: string[];
}

interface ToolSchema {
  properties?: Record<string, SchemaProperty>;
  required?: string[];
}

const TOOL_BY_NAME = new Map(TOOLS.map(tool => [tool.name, tool]));

const OPTIMIZATION_STRATEGIES: ReadonlySet<CompressionStrategy> = new Set([
  'auto',
  'truncate',
  'summarize',
  'filter',
  'as-is',
]);

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  return input as Record<string, unknown>;
}

function getOptimizationHints(args: unknown): {
  intent?: string;
  maxOutputTokens?: number;
  preferredStrategy?: CompressionStrategy;
} {
  const parsed = asObject(args);
  const rawIntent = parsed['intent'];
  const rawMax = parsed['max_output_tokens'];
  const rawStrategy = parsed['strategy'];

  const intent = typeof rawIntent === 'string' && rawIntent.trim() ? rawIntent : undefined;
  const maxOutputTokens =
    typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax > 0
      ? Math.floor(rawMax)
      : undefined;
  const preferredStrategy =
    typeof rawStrategy === 'string' &&
    OPTIMIZATION_STRATEGIES.has(rawStrategy as CompressionStrategy)
      ? (rawStrategy as CompressionStrategy)
      : undefined;

  return { intent, maxOutputTokens, preferredStrategy };
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
        default:
          throw new Error(`Unhandled tool: ${toolName}`);
      }

      const optimized = optimizeResponse(result, {
        intent: hints.intent,
        maxOutputTokens: hints.maxOutputTokens,
        preferredStrategy: hints.preferredStrategy,
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
        preferredStrategy: hints.preferredStrategy,
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
