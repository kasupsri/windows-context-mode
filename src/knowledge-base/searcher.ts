import { SqliteStore, type SearchResult } from './sqlite-store.js';
import { logger } from '../utils/logger.js';

export interface SearchOptions {
  kbName?: string;
  topK?: number;
  minScore?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
  totalFound: number;
  kbName: string;
}

export interface FormatSearchOptions {
  compact?: boolean;
}

export class Searcher {
  constructor(private store: SqliteStore) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const kbName = options.kbName ?? 'default';
    const topK = options.topK ?? 5;

    const sanitized = sanitizeQuery(query);
    if (!sanitized) {
      logger.warn('Empty query after sanitization');
      return { results: [], query, totalFound: 0, kbName };
    }

    let results: SearchResult[] = [];
    try {
      results = await this.store.search(sanitized, kbName, topK * 2);
    } catch (err) {
      logger.warn('Search failed', { err });
      results = [];
    }

    if (options.minScore !== undefined) {
      results = results.filter(r => r.score >= options.minScore!);
    }

    const finalResults = results.slice(0, topK);
    logger.debug('Search complete', { query, kbName, found: finalResults.length });

    return { results: finalResults, query, totalFound: finalResults.length, kbName };
  }

  formatResults(response: SearchResponse, options: FormatSearchOptions = {}): string {
    const compact = options.compact ?? true;
    if (response.results.length === 0) {
      return compact
        ? `search none q="${response.query}" kb=${response.kbName}`
        : `No results found for "${response.query}" in knowledge base "${response.kbName}".`;
    }

    if (compact) {
      const lines: string[] = [
        `search n=${response.totalFound} q="${response.query}" kb=${response.kbName}`,
      ];
      for (let i = 0; i < response.results.length; i++) {
        const r = response.results[i]!;
        const heading = r.heading ? ` h=${r.heading}` : '';
        lines.push(
          `${i + 1}. s=${r.score.toFixed(2)} src=${r.source}${heading}\n${r.snippet.slice(0, 140)}`
        );
      }
      return lines.join('\n');
    }

    const lines: string[] = [`Found ${response.totalFound} result(s) for "${response.query}":`, ''];
    for (let i = 0; i < response.results.length; i++) {
      const r = response.results[i]!;
      lines.push(`### Result ${i + 1} (score: ${r.score.toFixed(3)})`);
      if (r.heading) lines.push(`**Section:** ${r.heading}`);
      lines.push(`**Source:** ${r.source}`);
      lines.push('');
      lines.push(r.snippet);
      lines.push('');
    }

    return lines.join('\n');
  }
}

function sanitizeQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .filter(t => t.length > 1)
    .map(t => t.replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter(Boolean)
    .join(' ');
}
