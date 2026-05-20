// shell_sandbox: spawn de executável da allow-list sem shell, sob WORK_DIR,
// com timeout duro. Bloqueia argumentos que toquem Cont/Confidencial.

import { spawn } from 'node:child_process';
import { ToolSpec } from '../agents/types.js';
import { WORK_DIR, CONFIDENCIAL_DIR } from '../paths.js';

const DEFAULT_ALLOWLIST = ['node', 'npm', 'npx', 'git', 'python', 'python3', 'pwd', 'echo'];
const HARD_TIMEOUT_MS = 30_000;

export class ShellSandboxError extends Error {}

function getAllowlist(): string[] {
  const raw = process.env.CTBZ_SHELL_ALLOWLIST;
  if (!raw) return DEFAULT_ALLOWLIST;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function argTouchesConfidencial(a: string): boolean {
  // heurística: qualquer ocorrência do path absoluto ou do segmento "Confidencial"
  if (a.includes(CONFIDENCIAL_DIR)) return true;
  if (a.split(/[\\/]/).some((seg) => seg === 'Confidencial')) return true;
  return false;
}

export async function shellSandbox(args: Record<string, unknown>): Promise<string> {
  const cmd = args.cmd;
  const cmdArgsRaw = args.args ?? [];
  if (typeof cmd !== 'string' || !cmd) throw new ShellSandboxError("campo 'cmd' obrigatório");
  if (!Array.isArray(cmdArgsRaw)) throw new ShellSandboxError("'args' deve ser array");
  const cmdArgs: string[] = cmdArgsRaw.map(String);

  const allow = getAllowlist();
  if (!allow.includes(cmd)) {
    throw new ShellSandboxError(`'${cmd}' fora da allow-list. Permitidos: ${allow.join(', ')}`);
  }
  for (const a of cmdArgs) {
    if (argTouchesConfidencial(a)) {
      throw new ShellSandboxError(`argumento toca Confidencial: ${a}`);
    }
  }
  const timeoutMs = Math.min(Math.max(Number(args.timeout_ms ?? HARD_TIMEOUT_MS), 100), HARD_TIMEOUT_MS);

  return await new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd: WORK_DIR, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    child.stdout.on('data', (b: Buffer) => { stdout += b.toString('utf8'); if (stdout.length > 100_000) stdout = stdout.slice(-100_000); });
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString('utf8'); if (stderr.length > 50_000) stderr = stderr.slice(-50_000); });
    child.on('error', (e) => { clearTimeout(timer); reject(new ShellSandboxError(e.message)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      const out = `exit=${code ?? 'null'}\n--- stdout ---\n${stdout}--- stderr ---\n${stderr}`;
      resolve(out);
    });
  });
}

export const shellSandboxTool: ToolSpec = {
  name: 'shell_sandbox',
  description: 'Executa um comando da allow-list sob WORK_DIR, sem shell, sem pipes, timeout duro. Bloqueia args tocando Confidencial.',
  input_schema: {
    type: 'object',
    properties: {
      cmd: { type: 'string', description: 'Nome do executável (sem path).' },
      args: { type: 'array', items: { type: 'string' }, description: 'Argumentos posicionais.' },
      timeout_ms: { type: 'integer', minimum: 100, maximum: HARD_TIMEOUT_MS },
    },
    required: ['cmd'],
    additionalProperties: false,
  },
  handler: shellSandbox,
};
