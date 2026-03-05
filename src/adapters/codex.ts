import { type BaseAdapter, type AdapterConfig, type SetupResult } from './base-adapter.js';
import { access, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const CODEX_HELP = `# Codex Setup

Run:

\`\`\`bash
codex mcp add context-mode -- npx -y context-mode-universal
codex mcp list
\`\`\`
`;

export class CodexAdapter implements BaseAdapter {
  readonly ideName = 'Codex';
  readonly detectionPaths = ['.vscode'];

  async detect(cwd: string): Promise<boolean> {
    try {
      await access(join(cwd, '.vscode'));
      return true;
    } catch {
      return false;
    }
  }

  async setup(config: AdapterConfig): Promise<SetupResult> {
    const filesCreated: string[] = [];
    const vscodeDir = join(config.projectRoot, '.vscode');
    await mkdir(vscodeDir, { recursive: true });
    const docPath = join(vscodeDir, 'codex-context-mode.md');
    await writeFile(docPath, CODEX_HELP, 'utf8');
    filesCreated.push(docPath);

    return {
      ide: this.ideName,
      filesCreated,
      nextSteps: [
        '1. Run: codex mcp add context-mode -- npx -y context-mode-universal',
        '2. Verify: codex mcp list',
        '3. Restart your Codex-enabled VS Code window.',
      ],
    };
  }
}
