import { describe, it, expect } from 'vitest';
import { compress, detectContentType } from '../../src/compression/strategies.js';
import { DEFAULT_CONFIG } from '../../src/config/defaults.js';

// ─── Content Type Detection ────────────────────────────────────────────────

describe('detectContentType', () => {
  it('detects JSON objects', () => {
    expect(detectContentType('{"key": "value", "count": 42}')).toBe('json');
  });

  it('detects JSON arrays', () => {
    expect(detectContentType('[1, 2, 3]')).toBe('json');
  });

  it('detects log files with ISO timestamps', () => {
    const log = `2024-01-15T10:30:00Z INFO Starting server
2024-01-15T10:30:01Z INFO Listening on port 3000
2024-01-15T10:30:02Z ERROR Connection refused`;
    expect(detectContentType(log)).toBe('log');
  });

  it('detects log files with bracket timestamps', () => {
    const log = `[10:30:00] INFO: Starting
[10:30:01] WARN: Slow query
[10:30:02] ERROR: Timeout`;
    expect(detectContentType(log)).toBe('log');
  });

  it('detects CSV with commas', () => {
    const csv = `name,age,city
Alice,30,NYC
Bob,25,LA`;
    expect(detectContentType(csv)).toBe('csv');
  });

  it('detects TypeScript/JavaScript code', () => {
    const code = `export async function fetchUser(id: string) {
  const response = await fetch(\`/api/users/\${id}\`);
  return response.json();
}`;
    expect(detectContentType(code)).toBe('code');
  });

  it('detects markdown', () => {
    const md = `# My Document\n\nThis is a paragraph.\n\n## Section 2\n\nMore content.`;
    expect(detectContentType(md)).toBe('markdown');
  });

  it('returns generic for plain text', () => {
    const text = 'Hello world this is just some plain text without any special structure';
    expect(detectContentType(text)).toBe('generic');
  });
});

// ─── Compression ────────────────────────────────────────────────────────────

describe('compress', () => {
  it('returns as-is for small content below threshold', () => {
    const small = 'Hello world';
    const result = compress(small);
    expect(result.strategy).toBe('as-is');
    expect(result.output).toBe(small);
  });

  it('compresses large JSON', () => {
    const large: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      large[`key${i}`] = { value: `item_${i}`, count: i, nested: { x: i * 2 } };
    }
    const json = JSON.stringify(large, null, 2);
    expect(json.length).toBeGreaterThan(5120);

    const result = compress(json, { maxOutputChars: 3000 });
    expect(result.strategy).not.toBe('as-is');
    expect(result.outputChars).toBeLessThan(result.inputChars);
    expect(result.contentType).toBe('json');
  });

  it('compresses JSON arrays with schema info', () => {
    const arr = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
    }));
    const json = JSON.stringify(arr);

    const result = compress(json, { maxOutputChars: 2000 });
    expect(result.output).toContain('Array');
    expect(result.output).toContain('200');
    expect(result.outputChars).toBeLessThanOrEqual(2000);
  });

  it('compresses log files and highlights errors', () => {
    const lines: string[] = [];
    for (let i = 0; i < 200; i++) {
      if (i % 20 === 0) {
        lines.push(
          `2024-01-15T10:${String(i).padStart(2, '0')}:00Z ERROR Connection refused to db`
        );
      } else {
        lines.push(`2024-01-15T10:${String(i).padStart(2, '0')}:00Z INFO Processing request #${i}`);
      }
    }
    const log = lines.join('\n');

    const result = compress(log, { maxOutputChars: 3000 });
    expect(result.contentType).toBe('log');
    // Should highlight errors
    expect(result.output.toLowerCase()).toContain('error');
  });

  it('compresses markdown to outline', () => {
    const sections = ['Introduction', 'Installation', 'Configuration', 'API Reference', 'Examples'];
    // Each section has 300 words to ensure we exceed the 5KB threshold
    const md = sections
      .map(s => `# ${s}\n\nThis section covers ${s} topics in depth.\n\n${`word `.repeat(300)}`)
      .join('\n\n');

    expect(md.length).toBeGreaterThan(5120); // must be above threshold

    const result = compress(md, { maxOutputChars: 5000 });
    expect(result.contentType).toBe('markdown');
    // Should preserve all headings
    for (const s of sections) {
      expect(result.output).toContain(s);
    }
    expect(result.outputChars).toBeLessThan(result.inputChars);
  });

  it('filters by intent', () => {
    const text = `
# Authentication
This section covers auth.

# Database
Connect to PostgreSQL.
Configure connection pooling.

# Error Handling
Handle network timeouts.
Log all exceptions.
`;
    const bigText = text.repeat(20);
    const result = compress(bigText, { intent: 'error exception timeout', maxOutputChars: 2000 });
    expect(result.strategy).toBe('filter');
    // Should contain error-related content
    expect(result.output.toLowerCase()).toMatch(/error|exception|timeout/);
  });

  it('truncates generic content preserving head and tail', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}: some content here`);
    const text = lines.join('\n');

    const result = compress(text, { strategy: 'truncate', maxOutputChars: 3000 });
    expect(result.output).toContain('Line 1:');
    expect(result.output).toContain('Line 500:');
    expect(result.output).toContain('omitted');
  });

  it('compresses when max output budget is lower than threshold', () => {
    const text = 'Line with repeated content\n'.repeat(120); // ~3KB, below default threshold
    const result = compress(text, { maxOutputChars: 500 });

    expect(result.strategy).not.toBe('as-is');
    expect(result.outputChars).toBeLessThanOrEqual(500);
  });

  it('uses configured threshold from runtime config', () => {
    const originalThreshold = DEFAULT_CONFIG.compression.thresholdBytes;
    try {
      DEFAULT_CONFIG.compression.thresholdBytes = 10_000;
      const text = 'x'.repeat(6000);
      const result = compress(text);
      expect(result.strategy).toBe('as-is');
      expect(result.output).toBe(text);
    } finally {
      DEFAULT_CONFIG.compression.thresholdBytes = originalThreshold;
    }
  });

  it('compresses CSV with stats', () => {
    const header = 'product,price,quantity,category';
    const rows = Array.from(
      { length: 500 },
      (_, i) =>
        `Product${i},${(Math.random() * 100).toFixed(2)},${Math.floor(Math.random() * 100)},Cat${i % 5}`
    );
    const csv = [header, ...rows].join('\n');

    const result = compress(csv, { maxOutputChars: 2000 });
    expect(result.contentType).toBe('csv');
    expect(result.output).toContain('product');
    expect(result.output).toContain('500');
  });

  it('reports correct savings percentage', () => {
    const bigText = 'x'.repeat(50000);
    const result = compress(bigText, { strategy: 'truncate', maxOutputChars: 5000 });
    expect(result.savedPercent).toBeGreaterThan(80);
    expect(result.inputChars).toBe(50000);
  });
});
