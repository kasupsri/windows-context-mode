import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { readReferencesTool } from '../../src/tools/read-references.js';
import { contextCache } from '../../src/utils/context-cache.js';

describe('readReferencesTool', () => {
  let tempDir = '';
  let filePath = '';

  beforeEach(async () => {
    contextCache.clear();
    tempDir = await mkdtemp(join(tmpdir(), 'cmu-read-refs-'));
    filePath = join(tempDir, 'refs.ts');
    await writeFile(
      filePath,
      [
        'function work() {',
        '  const target = 1;',
        '  return target + 1;',
        '}',
        '',
        'export function wrap() {',
        '  return work();',
        '}',
      ].join('\n'),
      'utf8'
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('finds references from a file path', async () => {
    const result = await readReferencesTool({
      path: filePath,
      symbol: 'work',
      context_lines: 1,
      response_mode: 'full',
    });

    expect(result).toContain('Read References');
    expect(result).toContain('matches: 2');
    expect(result).toContain('context_id:');
    expect(result).toContain('function work');
    expect(result).toContain('return work()');
  });

  it('can fetch references again from context_id cache', async () => {
    const first = await readReferencesTool({
      path: filePath,
      symbol: 'target',
      response_mode: 'full',
    });
    const contextId = /^context_id:\s*(\S+)/m.exec(first)?.[1];
    expect(contextId).toBeTruthy();

    const second = await readReferencesTool({
      context_id: contextId,
      symbol: 'target',
      response_mode: 'full',
    });

    expect(second).toContain('cache: hit');
    expect(second).toContain('matches: 2');
  });
});
