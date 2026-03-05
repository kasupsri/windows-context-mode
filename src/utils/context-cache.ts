import { createHash } from 'crypto';

export interface ContextCacheEntry {
  id: string;
  content: string;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
  hits: number;
  bytes: number;
  lines: number;
}

export interface ContextCachePutResult {
  id: string;
  created: boolean;
  entry: ContextCacheEntry;
}

export interface ContextCacheStats {
  entries: number;
  bytes: number;
  totalHits: number;
}

const MAX_ENTRIES = 256;

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function countLines(content: string): number {
  if (content.length === 0) return 1;
  return content.replace(/\r\n/g, '\n').split('\n').length;
}

class ContextCache {
  private readonly entries = new Map<string, ContextCacheEntry>();

  put(content: string, source?: string): ContextCachePutResult {
    const digest = hashContent(content);
    const id = `ctx_${digest.slice(0, 16)}`;
    const now = new Date();
    const existing = this.entries.get(id);

    if (existing) {
      existing.content = content;
      existing.source = source ?? existing.source;
      existing.updatedAt = now;
      existing.bytes = Buffer.byteLength(content, 'utf8');
      existing.lines = countLines(content);
      return { id, created: false, entry: existing };
    }

    const entry: ContextCacheEntry = {
      id,
      content,
      source,
      createdAt: now,
      updatedAt: now,
      hits: 0,
      bytes: Buffer.byteLength(content, 'utf8'),
      lines: countLines(content),
    };
    this.entries.set(id, entry);
    this.trimToLimit();
    return { id, created: true, entry };
  }

  get(id: string): ContextCacheEntry | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    entry.hits += 1;
    entry.updatedAt = new Date();
    return entry;
  }

  clear(): void {
    this.entries.clear();
  }

  stats(): ContextCacheStats {
    let bytes = 0;
    let totalHits = 0;
    for (const entry of this.entries.values()) {
      bytes += entry.bytes;
      totalHits += entry.hits;
    }
    return { entries: this.entries.size, bytes, totalHits };
  }

  private trimToLimit(): void {
    if (this.entries.size <= MAX_ENTRIES) return;
    const ordered = [...this.entries.values()].sort(
      (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()
    );
    const overflow = this.entries.size - MAX_ENTRIES;
    for (let i = 0; i < overflow; i += 1) {
      const stale = ordered[i];
      if (stale) this.entries.delete(stale.id);
    }
  }
}

export const contextCache = new ContextCache();
