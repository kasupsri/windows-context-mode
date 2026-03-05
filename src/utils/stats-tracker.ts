import { writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { estimateTokens } from './token-estimator.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';

export interface CompressionEvent {
  tool: string;
  inputBytes: number;
  outputBytes: number;
  inputTokens: number;
  outputTokens: number;
  strategy: string;
  changed: boolean;
  budgetForced: boolean;
  candidateCount?: number;
  timestamp: Date;
}

export interface ToolStats {
  tool: string;
  events: number;
  responsesProcessed: number;
  responsesChanged: number;
  budgetForced: number;
  inputBytes: number;
  outputBytes: number;
  inputTokens: number;
  outputTokens: number;
  bytesSaved: number;
  tokensSaved: number;
  savingsRatio: number;
}

export interface SessionStats {
  startedAt: Date;
  generatedAt: Date;
  totalInputBytes: number;
  totalOutputBytes: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEvents: number;
  responsesProcessed: number;
  responsesChanged: number;
  budgetForced: number;
  bytesSaved: number;
  tokensSaved: number;
  savingsRatio: number;
  droppedEvents: number;
  byTool: ToolStats[];
  events: CompressionEvent[];
}

export interface RecordOptions {
  changed?: boolean;
  budgetForced?: boolean;
  candidateCount?: number;
}

function formatInteger(value: number): string {
  const integer = Number.isFinite(value) ? Math.trunc(value) : 0;
  return integer.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

class StatsTracker {
  private readonly startedAt: Date = new Date();
  private events: CompressionEvent[] = [];
  private droppedEvents = 0;

  record(
    tool: string,
    inputText: string,
    outputText: string,
    strategy: string,
    options: RecordOptions = {}
  ): CompressionEvent {
    const inputBytes = Buffer.byteLength(inputText, 'utf8');
    const outputBytes = Buffer.byteLength(outputText, 'utf8');
    const inputTokens = estimateTokens(inputText).tokens;
    const outputTokens = estimateTokens(outputText).tokens;

    const event: CompressionEvent = {
      tool,
      inputBytes,
      outputBytes,
      inputTokens,
      outputTokens,
      strategy,
      changed: options.changed ?? inputText !== outputText,
      budgetForced: options.budgetForced ?? false,
      candidateCount: options.candidateCount,
      timestamp: new Date(),
    };
    this.events.push(event);

    const maxEvents = Math.max(1, DEFAULT_CONFIG.stats.maxEvents);
    if (this.events.length > maxEvents) {
      const overflow = this.events.length - maxEvents;
      this.events.splice(0, overflow);
      this.droppedEvents += overflow;
    }

    return event;
  }

  getSessionStats(): SessionStats {
    const totalInputBytes = this.events.reduce((s, e) => s + e.inputBytes, 0);
    const totalOutputBytes = this.events.reduce((s, e) => s + e.outputBytes, 0);
    const totalInputTokens = this.events.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutputTokens = this.events.reduce((s, e) => s + e.outputTokens, 0);
    const bytesSaved = totalInputBytes - totalOutputBytes;
    const tokensSaved = totalInputTokens - totalOutputTokens;
    const savingsRatio = totalInputBytes > 0 ? (bytesSaved / totalInputBytes) * 100 : 0;
    const responsesProcessed = this.events.length;
    const responsesChanged = this.events.filter(e => e.changed).length;
    const budgetForced = this.events.filter(e => e.budgetForced).length;

    const byToolMap = new Map<string, ToolStats>();
    for (const event of this.events) {
      const existing =
        byToolMap.get(event.tool) ??
        ({
          tool: event.tool,
          events: 0,
          responsesProcessed: 0,
          responsesChanged: 0,
          budgetForced: 0,
          inputBytes: 0,
          outputBytes: 0,
          inputTokens: 0,
          outputTokens: 0,
          bytesSaved: 0,
          tokensSaved: 0,
          savingsRatio: 0,
        } as ToolStats);

      existing.events += 1;
      existing.responsesProcessed += 1;
      existing.responsesChanged += event.changed ? 1 : 0;
      existing.budgetForced += event.budgetForced ? 1 : 0;
      existing.inputBytes += event.inputBytes;
      existing.outputBytes += event.outputBytes;
      existing.inputTokens += event.inputTokens;
      existing.outputTokens += event.outputTokens;
      existing.bytesSaved = existing.inputBytes - existing.outputBytes;
      existing.tokensSaved = existing.inputTokens - existing.outputTokens;
      existing.savingsRatio =
        existing.inputBytes > 0 ? (existing.bytesSaved / existing.inputBytes) * 100 : 0;
      byToolMap.set(event.tool, existing);
    }

    const byTool = [...byToolMap.values()].sort((a, b) => b.bytesSaved - a.bytesSaved);

    return {
      startedAt: this.startedAt,
      generatedAt: new Date(),
      totalInputBytes,
      totalOutputBytes,
      totalInputTokens,
      totalOutputTokens,
      totalEvents: this.events.length,
      responsesProcessed,
      responsesChanged,
      budgetForced,
      bytesSaved,
      tokensSaved,
      savingsRatio,
      droppedEvents: this.droppedEvents,
      byTool,
      events: [...this.events],
    };
  }

  formatSessionStatsText(): string {
    const stats = this.getSessionStats();
    const lines = [
      '=== Context Mode Universal Session Stats ===',
      `Responses processed: ${stats.responsesProcessed}`,
      `Responses changed: ${stats.responsesChanged}`,
      `Budget-forced responses: ${stats.budgetForced}`,
      `Input: ${(stats.totalInputBytes / 1024).toFixed(1)} KB (${formatInteger(stats.totalInputTokens)} tokens)`,
      `Output: ${(stats.totalOutputBytes / 1024).toFixed(1)} KB (${formatInteger(stats.totalOutputTokens)} tokens)`,
      `Saved: ${(stats.bytesSaved / 1024).toFixed(1)} KB (${formatInteger(stats.tokensSaved)} tokens, ${stats.savingsRatio.toFixed(0)}%)`,
    ];
    if (stats.droppedEvents > 0) {
      lines.push(
        `Dropped old events: ${stats.droppedEvents} (max kept: ${DEFAULT_CONFIG.stats.maxEvents})`
      );
    }
    if (stats.byTool.length > 0) {
      lines.push('', 'Top tools by bytes saved:');
      for (const t of stats.byTool.slice(0, 5)) {
        lines.push(
          `- ${t.tool}: ${(t.bytesSaved / 1024).toFixed(1)} KB saved (${t.savingsRatio.toFixed(0)}%, ${t.events} event${t.events === 1 ? '' : 's'})`
        );
      }
    }
    return lines.join('\n');
  }

  formatSessionStatsMinimal(): string {
    const stats = this.getSessionStats();
    return [
      'stats',
      `events=${stats.totalEvents}`,
      `changed=${stats.responsesChanged}`,
      `budget=${stats.budgetForced}`,
      `in_tok=${stats.totalInputTokens}`,
      `out_tok=${stats.totalOutputTokens}`,
      `saved_tok=${stats.tokensSaved}`,
      `saved_pct=${stats.savingsRatio.toFixed(0)}`,
      `dropped=${stats.droppedEvents}`,
    ].join(' ');
  }

  async exportToFile(path?: string): Promise<string> {
    const targetPath =
      path ?? join(tmpdir(), `wcm-stats-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    const stats = this.getSessionStats();
    await writeFile(targetPath, JSON.stringify(stats, null, 2), 'utf8');
    return targetPath;
  }

  reset(): void {
    this.events = [];
    this.droppedEvents = 0;
  }
}

export const statsTracker = new StatsTracker();
