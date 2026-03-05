import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { proxyTool } from '../../src/tools/proxy-tool.js';
import { contextCache } from '../../src/utils/context-cache.js';

describe('proxyTool(read_file)', () => {
  const content = ['alpha', 'beta', 'needle one', 'delta', 'needle two', 'zeta', 'omega'].join(
    '\n'
  );

  let tempDir = '';
  let filePath = '';

  beforeEach(async () => {
    contextCache.clear();
    tempDir = await mkdtemp(join(tmpdir(), 'cmu-proxy-read-'));
    filePath = join(tempDir, 'fixture.txt');
    await writeFile(filePath, content, 'utf8');
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns full file when no selector args are provided', async () => {
    const result = await proxyTool({
      tool: 'read_file',
      args: { path: filePath },
      response_mode: 'full',
    });

    expect(result).toBe(content);
  });

  it('returns a selected line range with line numbers', async () => {
    const result = await proxyTool({
      tool: 'read_file',
      args: { path: filePath, start_line: 2, end_line: 4 },
      response_mode: 'full',
    });

    expect(result).toContain('lines: 2-4');
    expect(result).toContain('2| beta');
    expect(result).toContain('3| needle one');
    expect(result).toContain('4| delta');
    expect(result).not.toContain('1| alpha');
    expect(result).not.toContain('5| needle two');
  });

  it('returns query matches with surrounding context lines', async () => {
    const result = await proxyTool({
      tool: 'read_file',
      args: { path: filePath, query: 'needle', context_lines: 1, max_matches: 1 },
      response_mode: 'full',
    });

    expect(result).toContain('query: needle');
    expect(result).toContain('matches: 2 (showing first 1)');
    expect(result).toContain('2| beta');
    expect(result).toContain('3| needle one');
    expect(result).toContain('4| delta');
    expect(result).not.toContain('5| needle two');
  });

  it('rejects combining query mode with explicit line range', async () => {
    const result = await proxyTool({
      tool: 'read_file',
      args: { path: filePath, query: 'needle', start_line: 1 },
      response_mode: 'full',
    });

    expect(result).toContain('cannot combine args.query');
  });

  it('supports paged reads with cursor and next_cursor', async () => {
    const first = await proxyTool({
      tool: 'read_file',
      args: { path: filePath, page_lines: 3, cursor: 1 },
      response_mode: 'full',
    });

    expect(first).toContain('lines: 1-3 of 7');
    expect(first).toContain('next_cursor: 4');
    expect(first).toContain('1| alpha');
    expect(first).toContain('3| needle one');
    expect(first).not.toContain('4| delta');
  });

  it('supports context_id cache retrieval', async () => {
    const meta = await proxyTool({
      tool: 'read_file',
      args: { path: filePath, return_context_id: true },
      response_mode: 'full',
    });

    const contextId = /^context_id:\s*(\S+)/m.exec(meta)?.[1];
    expect(contextId).toBeTruthy();

    const fromCache = await proxyTool({
      tool: 'read_file',
      args: { context_id: contextId, page_lines: 2, cursor: 2 },
      response_mode: 'full',
    });

    expect(fromCache).toContain('cache: hit');
    expect(fromCache).toContain('lines: 2-3 of 7');
    expect(fromCache).toContain('2| beta');
    expect(fromCache).toContain('3| needle one');
  });
});
