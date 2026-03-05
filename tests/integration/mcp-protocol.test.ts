import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';
import { join } from 'path';

describe('MCP Protocol Compliance', () => {
  let client: Client;
  const extractText = (result: { content?: unknown }): string =>
    ((result.content as Array<{ type: string; text: string }>)[0]?.text ?? '') as string;

  beforeAll(async () => {
    const { server } = createServer();
    const [ct, st] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: { tools: {} } });

    await server.connect(st);
    await client.connect(ct);
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists all context mode universal tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name);

    expect(names).toContain('execute');
    expect(names).toContain('execute_file');
    expect(names).toContain('index');
    expect(names).toContain('search');
    expect(names).toContain('fetch_and_index');
    expect(names).toContain('compress');
    expect(names).toContain('proxy');
    expect(names).toContain('stats_get');
    expect(names).toContain('stats_reset');
    expect(names).toContain('stats_export');
    expect(names).toContain('doctor');
    expect(names).toContain('read_symbols');
    expect(names).toContain('read_references');
    expect(names).toContain('diagnostics_focus');
    expect(names).toContain('git_focus');
    expect(tools.length).toBe(15);
  });

  it('each tool has required JSON schema', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(typeof tool.inputSchema.properties).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('max_output_tokens');
    }
  });

  it('execute tool runs code and returns output', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        language: 'javascript',
        code: 'console.log("MCP test passed")',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toBeDefined();
    const text = extractText(result);
    expect(text).toContain('MCP test passed');
  });

  it('compress tool reduces large content', async () => {
    // Use a larger array to ensure optimizer has meaningful work.
    const largeContent = JSON.stringify(
      Array.from({ length: 500 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: i * 10,
        description: `Description for item number ${i} with extra padding`,
      }))
    );

    const result = await client.callTool({
      name: 'compress',
      arguments: { content: largeContent },
    });

    expect(result.isError).toBeFalsy();
    const text = extractText(result);
    expect(text.length).toBeLessThan(largeContent.length);
  });

  it('supports response_mode full escape hatch', async () => {
    const kbName = `full-kb-${Date.now()}`;
    await client.callTool({
      name: 'index',
      arguments: {
        content: '# Title\n\nalpha beta gamma',
        kb_name: kbName,
        response_mode: 'full',
      },
    });

    const result = await client.callTool({
      name: 'search',
      arguments: {
        query: 'alpha',
        kb_name: kbName,
        response_mode: 'full',
      },
    });

    const text = extractText(result);
    expect(text).toContain('Result');
  });

  it('stats tools return and reset session data', async () => {
    await client.callTool({
      name: 'compress',
      arguments: {
        content: JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ i, value: `item-${i}` }))),
      },
    });

    const stats = await client.callTool({ name: 'stats_get', arguments: {} });
    const statsText = extractText(stats);
    expect(statsText).toContain('stats');

    const reset = await client.callTool({ name: 'stats_reset', arguments: {} });
    const resetText = extractText(reset);
    expect(resetText).toContain('reset');
  });

  it('index and search round-trip works', async () => {
    const kbName = `test-kb-${Date.now()}`;

    await client.callTool({
      name: 'index',
      arguments: {
        content: `# TypeScript Guide\n\nTypeScript is a typed superset of JavaScript.\n\n## Interfaces\n\nUse interface to define contracts.`,
        source: 'typescript-guide.md',
        kb_name: kbName,
      },
    });

    const searchResult = await client.callTool({
      name: 'search',
      arguments: {
        query: 'interface contracts',
        kb_name: kbName,
      },
    });

    expect(searchResult.isError).toBeFalsy();
    const text = extractText(searchResult);
    expect(text).toMatch(/interface|contract|typescript/i);
  });

  it('returns error for unknown tool', async () => {
    const result = await client.callTool({
      name: 'nonexistent_tool',
      arguments: {},
    });

    expect(result.isError).toBe(true);
  });

  it('returns error for missing required parameters', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: { language: 'javascript' }, // missing 'code'
    });

    expect(result.isError).toBe(true);
    const text = extractText(result);
    expect(text).toContain('Missing required argument "code"');
  });

  it('returns error for invalid enum values', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        language: 'shell',
        code: 'echo hello',
        shell_runtime: 'fish',
      },
    });

    expect(result.isError).toBe(true);
    const text = extractText(result);
    expect(text).toContain('Invalid value for "shell_runtime"');
  });

  it('returns error for unknown arguments', async () => {
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        language: 'javascript',
        code: 'console.log("ok")',
        unknown_option: true,
      },
    });

    expect(result.isError).toBe(true);
    const text = extractText(result);
    expect(text).toContain('Unknown argument "unknown_option"');
  });

  it('all tools accept max_output_tokens and return budget-bounded output', async () => {
    const smallBudgetTokens = 20;
    const maxChars = smallBudgetTokens * 3;
    const filePath = join(process.cwd(), 'README.md');

    const cases: Array<{ name: string; arguments: Record<string, unknown> }> = [
      {
        name: 'execute',
        arguments: {
          language: 'javascript',
          code: 'console.log("a".repeat(1000))',
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'execute_file',
        arguments: {
          file_path: filePath,
          code: 'console.log((process.env.FILE_CONTENT || "").slice(0, 4000))',
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'index',
        arguments: {
          content: '# title\\n\\n' + 'word '.repeat(2000),
          kb_name: `budget-kb-${Date.now()}`,
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'search',
        arguments: {
          query: 'title',
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'fetch_and_index',
        arguments: {
          url: 'https://',
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'compress',
        arguments: {
          content: 'x'.repeat(5000),
          strategy: 'summarize',
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'proxy',
        arguments: {
          tool: 'unknown_tool',
          args: {},
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'stats_get',
        arguments: {
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'stats_reset',
        arguments: {
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'stats_export',
        arguments: {
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'doctor',
        arguments: {
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'read_symbols',
        arguments: {
          path: filePath,
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'read_references',
        arguments: {
          path: filePath,
          symbol: 'context',
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'diagnostics_focus',
        arguments: {
          content: 'src/a.ts(1,1): error TS1000: boom',
          max_output_tokens: smallBudgetTokens,
        },
      },
      {
        name: 'git_focus',
        arguments: {
          repo_path: process.cwd(),
          max_output_tokens: smallBudgetTokens,
        },
      },
    ];

    for (const t of cases) {
      const result = await client.callTool({ name: t.name, arguments: t.arguments });
      const text = extractText(result);
      expect(text.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it('optimizes error responses under budget while preserving error marker', async () => {
    const budgetTokens = 5;
    const result = await client.callTool({
      name: 'execute',
      arguments: {
        language: 'javascript',
        max_output_tokens: budgetTokens,
      },
    });

    expect(result.isError).toBe(true);
    const text = extractText(result);
    expect(text.length).toBeLessThanOrEqual(budgetTokens * 3);
    expect(/error|stderr|exit code|timeout/i.test(text)).toBe(true);
  });
});
