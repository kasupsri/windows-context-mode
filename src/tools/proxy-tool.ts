import { type CompressionStrategy } from '../compression/strategies.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { type ResponseMode } from '../config/defaults.js';
import { executeCode } from '../sandbox/executor.js';
import { type Language, type ShellRuntime } from '../sandbox/runtimes.js';
import {
  denyReason,
  evaluateCommand,
  evaluateFilePath,
  extractShellCommands,
} from '../security/policy.js';
import { readFile, stat } from 'fs/promises';
import {
  parseCursorLine,
  parsePositiveInteger,
  selectByQuery,
  selectLineRange,
  selectPage,
} from './file-selectors.js';
import { contextCache } from '../utils/context-cache.js';

export interface ProxyToolInput {
  tool: string;
  args: Record<string, unknown>;
  intent?: string;
  strategy?: CompressionStrategy;
  max_output_tokens?: number;
  response_mode?: ResponseMode;
}

interface ReadFileSelectionArgs {
  filePath?: string;
  contextId?: string;
  startLine?: number;
  endLine?: number;
  query?: string;
  contextLines: number;
  maxMatches: number;
  includeLineNumbers: boolean;
  cursorLine?: number;
  pageLines?: number;
  returnContextId: boolean;
}

function parseReadFileSelectionArgs(args: Record<string, unknown>): ReadFileSelectionArgs | string {
  const filePath = args['path'];
  const contextIdRaw = args['context_id'];
  if (contextIdRaw !== undefined && typeof contextIdRaw !== 'string') {
    return 'Error: proxy(read_file) args.context_id must be a string';
  }
  const contextId =
    typeof contextIdRaw === 'string' && contextIdRaw.trim() ? contextIdRaw : undefined;
  if (filePath !== undefined && typeof filePath !== 'string') {
    return 'Error: proxy(read_file) args.path must be a string';
  }
  const normalizedPath =
    typeof filePath === 'string' && filePath.trim() ? filePath.trim() : undefined;

  if (!normalizedPath && !contextId) {
    return 'Error: proxy(read_file) requires args.path or args.context_id';
  }
  if (normalizedPath && contextId) {
    return 'Error: proxy(read_file) cannot combine args.path with args.context_id';
  }

  const startLine = parsePositiveInteger(args['start_line'], 'proxy(read_file) args.start_line');
  if (typeof startLine === 'string') return startLine;
  const endLine = parsePositiveInteger(args['end_line'], 'proxy(read_file) args.end_line');
  if (typeof endLine === 'string') return endLine;
  const contextLines = parsePositiveInteger(
    args['context_lines'],
    'proxy(read_file) args.context_lines'
  );
  if (typeof contextLines === 'string') return contextLines;
  const maxMatches = parsePositiveInteger(args['max_matches'], 'proxy(read_file) args.max_matches');
  if (typeof maxMatches === 'string') return maxMatches;
  const pageLines = parsePositiveInteger(args['page_lines'], 'proxy(read_file) args.page_lines');
  if (typeof pageLines === 'string') return pageLines;
  const cursorLine = parseCursorLine(args['cursor']);
  if (typeof cursorLine === 'string') return cursorLine;

  const includeLineNumbersRaw = args['include_line_numbers'];
  if (includeLineNumbersRaw !== undefined && typeof includeLineNumbersRaw !== 'boolean') {
    return 'Error: proxy(read_file) args.include_line_numbers must be a boolean';
  }
  const includeLineNumbers = includeLineNumbersRaw ?? true;

  const queryRaw = args['query'];
  if (queryRaw !== undefined && typeof queryRaw !== 'string') {
    return 'Error: proxy(read_file) args.query must be a string';
  }
  const query = typeof queryRaw === 'string' && queryRaw.trim() ? queryRaw.trim() : undefined;
  const returnContextIdRaw = args['return_context_id'];
  if (returnContextIdRaw !== undefined && typeof returnContextIdRaw !== 'boolean') {
    return 'Error: proxy(read_file) args.return_context_id must be a boolean';
  }
  const returnContextId = returnContextIdRaw ?? false;

  if (query && (startLine !== undefined || endLine !== undefined || cursorLine !== undefined)) {
    return 'Error: proxy(read_file) cannot combine args.query with args.start_line/args.end_line';
  }
  if (
    startLine !== undefined &&
    endLine !== undefined &&
    Number.isFinite(startLine) &&
    Number.isFinite(endLine) &&
    endLine < startLine
  ) {
    return 'Error: proxy(read_file) args.end_line must be >= args.start_line';
  }
  if ((startLine !== undefined || endLine !== undefined) && cursorLine !== undefined) {
    return 'Error: proxy(read_file) cannot combine line ranges with args.cursor';
  }

  return {
    filePath: normalizedPath,
    contextId,
    startLine,
    endLine,
    query,
    contextLines: contextLines ?? 2,
    maxMatches: maxMatches ?? 20,
    includeLineNumbers,
    cursorLine,
    pageLines,
    returnContextId,
  };
}

interface ReadFileLoaded {
  content: string;
  sourceLabel: string;
  contextId: string;
  fromCache: boolean;
}

async function loadReadFileContent(
  parsed: ReadFileSelectionArgs
): Promise<ReadFileLoaded | string> {
  if (parsed.contextId) {
    const entry = contextCache.get(parsed.contextId);
    if (!entry) {
      return `Error: unknown context_id "${parsed.contextId}"`;
    }
    return {
      content: entry.content,
      sourceLabel: entry.source ?? `context:${entry.id}`,
      contextId: entry.id,
      fromCache: true,
    };
  }

  const filePath = parsed.filePath;
  if (!filePath) {
    return 'Error: proxy(read_file) missing source';
  }

  const denied = evaluateFilePath(filePath);
  if (denied.denied) {
    return `Blocked by security policy: file path matches "${denied.matchedPattern}"`;
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);
  } catch (err) {
    return `Error reading file "${filePath}": ${String(err)}`;
  }

  if (!fileStats.isFile()) {
    return `Error reading file "${filePath}": path is not a regular file`;
  }

  if (fileStats.size > DEFAULT_CONFIG.sandbox.maxFileBytes) {
    return [
      `Error reading file "${filePath}": file is too large for proxy(read_file).`,
      `Size: ${fileStats.size} bytes, limit: ${DEFAULT_CONFIG.sandbox.maxFileBytes} bytes.`,
    ].join('\n');
  }

  try {
    const content = await readFile(filePath, 'utf8');
    const stored = contextCache.put(content, filePath);
    return {
      content,
      sourceLabel: filePath,
      contextId: stored.id,
      fromCache: false,
    };
  } catch (err) {
    return `Error reading file "${filePath}": ${String(err)}`;
  }
}

function renderReadFileMetadata(
  loaded: ReadFileLoaded,
  content: string,
  extra: string[] = []
): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n').length;
  return [
    '=== proxy(read_file) cached ===',
    `source: ${loaded.sourceLabel}`,
    `context_id: ${loaded.contextId}`,
    `chars: ${content.length}`,
    `lines: ${lines}`,
    ...extra,
  ].join('\n');
}

export async function proxyTool(input: ProxyToolInput): Promise<string> {
  const responseMode = input.response_mode ?? DEFAULT_CONFIG.compression.responseMode;
  let rawOutput: string;

  switch (input.tool) {
    case 'execute':
    case 'bash': {
      const lang = (input.args['language'] as Language | undefined) ?? 'shell';
      const code =
        (input.args['code'] as string | undefined) ??
        (input.args['command'] as string | undefined) ??
        '';
      const shellRuntime = input.args['shell_runtime'] as ShellRuntime | undefined;
      const requestedTimeout = input.args['timeout'];
      const timeout =
        typeof requestedTimeout === 'number' &&
        Number.isFinite(requestedTimeout) &&
        requestedTimeout > 0
          ? Math.floor(requestedTimeout)
          : DEFAULT_CONFIG.sandbox.timeoutMs;

      if (
        lang === 'shell' ||
        lang === 'powershell' ||
        lang === 'cmd' ||
        lang === 'bash' ||
        lang === 'sh'
      ) {
        const decision = evaluateCommand(code);
        if (decision.decision === 'deny' || decision.decision === 'ask') {
          return denyReason(decision);
        }
      } else {
        const embedded = extractShellCommands(code, lang);
        for (const cmd of embedded) {
          const decision = evaluateCommand(cmd);
          if (decision.decision === 'deny' || decision.decision === 'ask') {
            return denyReason(decision);
          }
        }
      }

      const result = await executeCode({
        language: lang,
        code,
        shellRuntime,
        timeoutMs: timeout,
        allowAuthPassthrough: DEFAULT_CONFIG.sandbox.allowAuthPassthrough,
      });
      if (responseMode === 'full') {
        rawOutput = result.stdout;
        if (result.stderr) {
          rawOutput += `${rawOutput ? '\n' : ''}STDERR:\n${result.stderr}`;
        }
        if (result.timedOut) {
          rawOutput = `[TIMEOUT after ${timeout}ms]\n${rawOutput}`;
        }
        if (result.exitCode !== 0 && !result.timedOut) {
          rawOutput += `\n[Exit code: ${result.exitCode}]`;
        }
      } else {
        const parts: string[] = [];
        if (result.timedOut) parts.push(`timeout:${timeout}ms`);
        if (result.stderr.trim()) parts.push(`err:${result.stderr.trim()}`);
        if (result.stdout.trim()) parts.push(result.stdout.trimEnd());
        if (result.exitCode !== 0 && !result.timedOut) parts.push(`code:${result.exitCode}`);
        rawOutput = parts.join('\n') || 'ok';
      }
      break;
    }

    case 'read_file': {
      const parsedReadArgs = parseReadFileSelectionArgs(input.args);
      if (typeof parsedReadArgs === 'string') {
        return parsedReadArgs;
      }
      const loaded = await loadReadFileContent(parsedReadArgs);
      if (typeof loaded === 'string') {
        return loaded;
      }

      const {
        startLine,
        endLine,
        query,
        contextLines,
        maxMatches,
        includeLineNumbers,
        cursorLine,
        pageLines,
        returnContextId,
      } = parsedReadArgs;

      const metadataPrefix = [
        `source: ${loaded.sourceLabel}`,
        `context_id: ${loaded.contextId}`,
        loaded.fromCache ? 'cache: hit' : 'cache: store',
      ];

      if (returnContextId) {
        rawOutput = renderReadFileMetadata(loaded, loaded.content, [
          'tip: use args.context_id + args.cursor/page_lines to fetch paged content',
        ]);
        break;
      }

      if (query) {
        const selected = selectByQuery(loaded.content, query, {
          contextLines,
          maxMatches,
          includeLineNumbers,
          caseSensitive: false,
        });
        const shownHint =
          selected.totalMatches > selected.shownMatches
            ? ` (showing first ${selected.shownMatches})`
            : '';
        rawOutput = [
          '=== proxy(read_file) query ===',
          ...metadataPrefix,
          `query: ${query}`,
          `matches: ${selected.totalMatches}${shownHint}`,
          `context_lines: ${contextLines}`,
          selected.text || '(no output)',
        ].join('\n');
        break;
      }

      if (startLine !== undefined || endLine !== undefined) {
        const selected = selectLineRange(loaded.content, startLine, endLine, {
          includeLineNumbers,
        });
        rawOutput = [
          '=== proxy(read_file) range ===',
          ...metadataPrefix,
          `lines: ${selected.startLine}-${selected.endLine} of ${selected.totalLines}`,
          selected.text || '(no output)',
        ].join('\n');
        break;
      }

      if (cursorLine !== undefined || pageLines !== undefined) {
        const paged = selectPage(loaded.content, cursorLine, { pageLines, includeLineNumbers });
        rawOutput = [
          '=== proxy(read_file) page ===',
          ...metadataPrefix,
          `lines: ${paged.startLine}-${paged.endLine} of ${paged.totalLines}`,
          `next_cursor: ${paged.nextCursor ?? 'end'}`,
          paged.text || '(no output)',
        ].join('\n');
        break;
      }

      rawOutput = loaded.content;
      break;
    }

    default: {
      if (responseMode === 'full') {
        return [
          `The proxy tool cannot directly invoke "${input.tool}" ` +
            '(MCP servers cannot call other MCP tools).',
          '',
          'Instead, capture the output yourself and pipe it through the compress tool:',
          '',
          '```',
          'compress({',
          `  content: <output from ${input.tool}>,`,
          input.intent ? `  intent: "${input.intent}",` : '',
          '})',
          '```',
          '',
          'Or use execute() with shell to run CLI commands and get compressed output.',
        ]
          .filter(Boolean)
          .join('\n');
      }
      return `err:proxy_unsupported tool=${input.tool}`;
    }
  }

  return rawOutput;
}
