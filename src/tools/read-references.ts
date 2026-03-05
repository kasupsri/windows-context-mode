import { readFile, stat } from 'fs/promises';
import { DEFAULT_CONFIG, type ResponseMode } from '../config/defaults.js';
import { evaluateFilePath } from '../security/policy.js';
import { contextCache } from '../utils/context-cache.js';
import { parsePositiveInteger, selectByQuery } from './file-selectors.js';

export interface ReadReferencesToolInput {
  path?: string;
  context_id?: string;
  symbol: string;
  context_lines?: number;
  max_matches?: number;
  include_line_numbers?: boolean;
  case_sensitive?: boolean;
  whole_word?: boolean;
  max_output_tokens?: number;
  response_mode?: ResponseMode;
}

interface LoadedSource {
  sourceLabel: string;
  content: string;
  contextId: string;
  fromCache: boolean;
}

async function loadSource(input: ReadReferencesToolInput): Promise<LoadedSource | string> {
  if (input.context_id) {
    const entry = contextCache.get(input.context_id);
    if (!entry) {
      return `Error: unknown context_id "${input.context_id}"`;
    }
    return {
      sourceLabel: entry.source ?? `context:${entry.id}`,
      content: entry.content,
      contextId: entry.id,
      fromCache: true,
    };
  }

  if (!input.path?.trim()) {
    return 'Error: read_references requires "path" or "context_id"';
  }

  const denied = evaluateFilePath(input.path);
  if (denied.denied) {
    return `Blocked by security policy: file path matches "${denied.matchedPattern}"`;
  }

  let fileStats;
  try {
    fileStats = await stat(input.path);
  } catch (err) {
    return `Error reading file "${input.path}": ${String(err)}`;
  }

  if (!fileStats.isFile()) {
    return `Error reading file "${input.path}": path is not a regular file`;
  }

  if (fileStats.size > DEFAULT_CONFIG.sandbox.maxFileBytes) {
    return [
      `Error reading file "${input.path}": file is too large for read_references.`,
      `Size: ${fileStats.size} bytes, limit: ${DEFAULT_CONFIG.sandbox.maxFileBytes} bytes.`,
    ].join('\n');
  }

  let content: string;
  try {
    content = await readFile(input.path, 'utf8');
  } catch (err) {
    return `Error reading file "${input.path}": ${String(err)}`;
  }

  const stored = contextCache.put(content, input.path);
  return {
    sourceLabel: input.path,
    content,
    contextId: stored.id,
    fromCache: false,
  };
}

export async function readReferencesTool(input: ReadReferencesToolInput): Promise<string> {
  if (!input.symbol?.trim()) {
    return 'Error: read_references requires "symbol"';
  }

  const parsedContextLines = parsePositiveInteger(
    input.context_lines,
    'read_references.context_lines'
  );
  if (typeof parsedContextLines === 'string') return parsedContextLines;
  const parsedMaxMatches = parsePositiveInteger(input.max_matches, 'read_references.max_matches');
  if (typeof parsedMaxMatches === 'string') return parsedMaxMatches;

  const loaded = await loadSource(input);
  if (typeof loaded === 'string') return loaded;

  const contextLines = parsedContextLines ?? 2;
  const maxMatches = parsedMaxMatches ?? 20;
  const includeLineNumbers = input.include_line_numbers ?? true;
  const caseSensitive = input.case_sensitive ?? true;
  const wholeWord = input.whole_word ?? true;
  const responseMode = input.response_mode ?? DEFAULT_CONFIG.compression.responseMode;

  const selected = selectByQuery(loaded.content, input.symbol, {
    contextLines,
    maxMatches,
    includeLineNumbers,
    caseSensitive,
    wholeWord,
  });

  if (responseMode === 'minimal') {
    return [
      'ok:references',
      `symbol=${input.symbol}`,
      `matches=${selected.totalMatches}`,
      `shown=${selected.shownMatches}`,
      `context_id=${loaded.contextId}`,
      loaded.fromCache ? 'cache=hit' : 'cache=store',
    ].join(' ');
  }

  const shownHint =
    selected.totalMatches > selected.shownMatches
      ? ` (showing first ${selected.shownMatches})`
      : '';

  return [
    '=== Read References ===',
    `symbol: ${input.symbol}`,
    `source: ${loaded.sourceLabel}`,
    `context_id: ${loaded.contextId}`,
    loaded.fromCache ? 'cache: hit' : 'cache: store',
    `matches: ${selected.totalMatches}${shownHint}`,
    `context_lines: ${contextLines}`,
    selected.text || '(no matches)',
  ].join('\n');
}
