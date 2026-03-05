import { DEFAULT_CONFIG } from '../config/defaults.js';
import { getAvailableRuntimes, getRuntimeForLanguage } from '../sandbox/runtimes.js';
import { evaluateCommand, evaluateFilePath } from '../security/policy.js';

export interface DoctorToolInput {
  max_output_tokens?: number;
}

export function doctorTool(_input: DoctorToolInput = {}): string {
  const runtimes = getAvailableRuntimes();
  const shell = getRuntimeForLanguage('shell', DEFAULT_CONFIG.sandbox.shellDefault);
  const shellRuntime = shell?.runtimeId ?? shell?.command ?? 'unavailable';

  const riskyCommand =
    process.platform === 'win32'
      ? 'Remove-Item -Recurse -Force C:\\temp\\danger'
      : 'rm -rf /tmp/danger';
  const riskyEval = evaluateCommand(riskyCommand);
  const envEval = evaluateFilePath('.env');

  const lines = [
    '=== Context Mode Universal Doctor ===',
    `Platform: ${process.platform}`,
    `Node: ${process.version}`,
    `Default shell: ${DEFAULT_CONFIG.sandbox.shellDefault}`,
    `Resolved shell runtime: ${shellRuntime}`,
    `Policy mode: ${DEFAULT_CONFIG.security.policyMode}`,
    `Private-network fetches: ${DEFAULT_CONFIG.security.allowPrivateNetworkFetch ? 'allowed' : 'blocked'}`,
    `Stats max events: ${DEFAULT_CONFIG.stats.maxEvents}`,
    `Max output bytes: ${DEFAULT_CONFIG.compression.maxOutputBytes} bytes`,
    `Execution timeout: ${DEFAULT_CONFIG.sandbox.timeoutMs} ms`,
    `Max execute_file size: ${DEFAULT_CONFIG.sandbox.maxFileBytes} bytes`,
    `Auth passthrough: ${DEFAULT_CONFIG.sandbox.allowAuthPassthrough ? 'enabled' : 'disabled'}`,
    `Max fetch size: ${DEFAULT_CONFIG.knowledgeBase.maxFetchBytes} bytes`,
    `Knowledge base path: ${DEFAULT_CONFIG.knowledgeBase.dbPath}`,
    '',
    `Available runtimes (${runtimes.length}):`,
    ...runtimes.map(r => `- ${r.language}: ${r.command}`),
    '',
    `Safety self-check (command): ${riskyEval.decision.toUpperCase()} (${riskyEval.matchedPattern ?? 'n/a'})`,
    `Safety self-check (.env path): ${envEval.denied ? 'DENY' : 'ALLOW'} (${envEval.matchedPattern ?? 'n/a'})`,
  ];

  return lines.join('\n');
}
