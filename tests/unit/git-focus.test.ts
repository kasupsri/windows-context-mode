import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { gitFocusTool } from '../../src/tools/git-focus.js';

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd, windowsHide: true });
}

async function hasGit(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

describe('gitFocusTool', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cmu-git-focus-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  it('summarizes working tree changes', async () => {
    if (!(await hasGit())) {
      console.log('Skipping git focus test: git is not available');
      return;
    }

    await runGit(tempDir, ['init']);
    await runGit(tempDir, ['config', 'user.email', 'ci@example.com']);
    await runGit(tempDir, ['config', 'user.name', 'ci']);

    const filePath = join(tempDir, 'app.ts');
    await writeFile(filePath, 'export function hello() {\n  return "hi";\n}\n', 'utf8');
    await runGit(tempDir, ['add', 'app.ts']);
    await runGit(tempDir, ['commit', '-m', 'init']);

    await writeFile(
      filePath,
      [
        'export function hello(name: string) {',
        '  return `hi ${name}`;',
        '}',
        '',
        'export function addedFeature() {',
        '  return 42;',
        '}',
      ].join('\n'),
      'utf8'
    );

    const full = await gitFocusTool({
      repo_path: tempDir,
      response_mode: 'full',
    });
    expect(full).toContain('Git Focus');
    expect(full).toContain('app.ts');
    expect(full).toContain('addedFeature');

    const minimal = await gitFocusTool({
      repo_path: tempDir,
      response_mode: 'minimal',
    });
    expect(minimal).toContain('ok:git_focus');
    expect(minimal).toContain('files=');
  }, 20_000);
});
