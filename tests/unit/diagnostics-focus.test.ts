import { describe, it, expect } from 'vitest';
import { diagnosticsFocusTool } from '../../src/tools/diagnostics-focus.js';

describe('diagnosticsFocusTool', () => {
  it('deduplicates TypeScript diagnostics', () => {
    const log = [
      'src/app.ts(10,5): error TS2322: Type string is not assignable to number.',
      'src/app.ts(10,5): error TS2322: Type string is not assignable to number.',
      'src/app.ts(18,3): warning TS6133: x is declared but its value is never read.',
    ].join('\n');

    const result = diagnosticsFocusTool({
      content: log,
      format: 'tsc',
      response_mode: 'full',
    });

    expect(result).toContain('Diagnostics Focus');
    expect(result).toContain('issues: 2');
    expect(result).toContain('errors: 1');
    expect(result).toContain('warnings: 1');
    expect(result).toContain('TS2322');
    expect(result).toContain('x2');
  });

  it('returns compact summary in minimal mode', () => {
    const log = [
      'src/app.ts(10,5): error TS2322: Type string is not assignable to number.',
      'src/app.ts(18,3): warning TS6133: x is declared but its value is never read.',
    ].join('\n');

    const result = diagnosticsFocusTool({
      content: log,
      response_mode: 'minimal',
    });

    expect(result).toContain('ok:diagnostics_focus');
    expect(result).toContain('issues=');
  });
});
