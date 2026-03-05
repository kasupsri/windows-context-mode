import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { readSymbolsTool } from '../../src/tools/read-symbols.js';

describe('readSymbolsTool', () => {
  let tempDir = '';
  let filePath = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cmu-read-symbols-'));
    filePath = join(tempDir, 'sample.ts');
    await writeFile(
      filePath,
      [
        'export interface User {',
        '  id: string;',
        '}',
        '',
        'export type UserId = string;',
        '',
        'export class UserService {}',
        '',
        'export function createUser(id: string) {',
        '  return { id };',
        '}',
        '',
        'const toUser = (id: string) => ({ id });',
      ].join('\n'),
      'utf8'
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('extracts common symbols from source file', async () => {
    const result = await readSymbolsTool({
      path: filePath,
      response_mode: 'full',
    });

    expect(result).toContain('Read Symbols');
    expect(result).toContain('interface User');
    expect(result).toContain('type UserId');
    expect(result).toContain('class UserService');
    expect(result).toContain('function createUser');
    expect(result).toContain('const toUser');
  });

  it('supports filtering by kind and query', async () => {
    const result = await readSymbolsTool({
      path: filePath,
      kind: 'function',
      query: 'create',
      response_mode: 'full',
    });

    expect(result).toContain('function createUser');
    expect(result).not.toContain('class UserService');
  });

  it('returns compact minimal output', async () => {
    const result = await readSymbolsTool({
      path: filePath,
      response_mode: 'minimal',
      max_symbols: 2,
    });

    expect(result).toContain('ok:symbols');
    expect(result).toContain('shown=2');
  });
});
