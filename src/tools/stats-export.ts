import { DEFAULT_CONFIG } from '../config/defaults.js';
import { statsTracker } from '../utils/stats-tracker.js';
import { type ResponseMode } from '../config/defaults.js';

export interface StatsExportInput {
  path?: string;
  max_output_tokens?: number;
  response_mode?: ResponseMode;
}

export async function statsExportTool(input: StatsExportInput): Promise<string> {
  const path = await statsTracker.exportToFile(input.path ?? DEFAULT_CONFIG.stats.exportPath);
  const responseMode = input.response_mode ?? DEFAULT_CONFIG.compression.responseMode;
  return responseMode === 'full'
    ? `Session stats exported to: ${path}`
    : `ok:stats_export path=${path}`;
}
