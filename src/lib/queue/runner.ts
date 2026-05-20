// QueueRunner: pega items pendentes de um arquivo, dispatcha pra agente nativo
// (default: briefing) ou provider spawn, executa verify (se houver), persiste
// resultado em SQLite + flip do checkbox no arquivo, e emite eventos via channels.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseTaskFile, setItemStatusInFile, ItemStatus } from './parser.js';
import { Multiplexer } from './channels.js';
import { REGISTRY } from '../agents/registry.js';
import '../agents/index.js'; // bootstrap
import { TOOL_FACTORIES } from '../tools/index.js';
import { AgentBridge } from '../native/anthropic_bridge.js';
import {
  upsertTaskFile, upsertTaskItem, setTaskItemStatus,
  startTaskRun, finishTaskRun,
} from '../state.js';
import { WORK_DIR, ensureDir, TASKS_STATE_DIR } from '../paths.js';

export interface QueueRunOptions {
  maxItems?: number;
  defaultAgent?: string;
  defaultModel?: string;
  dryRun?: boolean;
  cancelSignal?: AbortSignal;
}

export interface QueueRunResult {
  fileId: number;
  totalItems: number;
  ran: number;
  ok: number;
  failed: number;
}

function tail(s: string, n = 2000): string {
  return s.length <= n ? s : '…' + s.slice(-n);
}

async function runVerify(cmd: string, timeoutMs = 60_000): Promise<{ code: number; stdout: string; stderr: string }> {
  // verify roda via shell pra permitir pipes e &&. WORK_DIR como cwd.
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd: WORK_DIR, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    child.stdout.on('data', (b: Buffer) => { stdout += b.toString('utf8'); });
    child.stderr.on('data', (b: Buffer) => { stderr += b.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

async function runItemWithAgent(
  agentName: string,
  modelName: string | undefined,
  description: string,
  mp: Multiplexer,
  queueName: string,
  lineNo: number,
): Promise<{ assistantText: string; ok: boolean; errMsg?: string }> {
  const spec = REGISTRY[agentName];
  if (!spec) return { assistantText: '', ok: false, errMsg: `agente desconhecido: ${agentName}` };
  let bridge: AgentBridge;
  try {
    bridge = AgentBridge.fromEnv(modelName ?? spec.model_name ?? 'claude-opus-4-7');
  } catch (e: unknown) {
    return { assistantText: '', ok: false, errMsg: e instanceof Error ? e.message : String(e) };
  }
  for (const tn of spec.tools) {
    const t = TOOL_FACTORIES[tn];
    if (t) bridge.registerTool(t);
  }
  let acc = '';
  let errMsg: string | undefined;
  try {
    for await (const ev of bridge.stream(spec, description, [])) {
      if (ev.type === 'text') {
        acc += ev.text;
        mp.emit({ queue: queueName, level: 'info', kind: 'item_text', payload: { lineNo, delta: ev.text } });
      } else if (ev.type === 'tool_use') {
        mp.emit({ queue: queueName, level: 'info', kind: 'item_tool_start', payload: { lineNo, name: ev.tool_name, input: ev.tool_input } });
      } else if (ev.type === 'tool_result') {
        mp.emit({ queue: queueName, level: ev.tool_ok ? 'info' : 'warn', kind: 'item_tool_end', payload: { lineNo, name: ev.tool_name, ok: ev.tool_ok, elapsed_ms: ev.elapsed_ms } });
      } else if (ev.type === 'error') {
        errMsg = ev.error;
      } else if (ev.type === 'done') {
        break;
      }
    }
  } catch (e: unknown) {
    errMsg = e instanceof Error ? e.message : String(e);
  }
  return { assistantText: acc, ok: !errMsg, errMsg };
}

export async function runQueueFile(
  filePath: string,
  mp: Multiplexer,
  opts: QueueRunOptions = {},
): Promise<QueueRunResult> {
  const abs = path.resolve(filePath);
  const parsed = parseTaskFile(abs);
  const fileId = upsertTaskFile(abs, parsed.title, parsed.items.length);
  ensureDir(TASKS_STATE_DIR);

  // sincroniza items no SQLite
  for (const it of parsed.items) {
    upsertTaskItem({
      fileId,
      lineNo: it.lineNo,
      description: it.description,
      agentName: it.agent ?? opts.defaultAgent ?? 'briefing',
      modelName: it.model ?? opts.defaultModel,
      verifyCmd: it.verify ?? null,
      status: it.status,
    });
  }

  const pending = parsed.items.filter((it) => it.status === 'pending');
  const queueName = path.basename(abs, '.md');

  mp.emit({ queue: queueName, level: 'info', kind: 'queue_start', payload: { fileId, total: parsed.items.length, pending: pending.length, dryRun: !!opts.dryRun } });

  const result: QueueRunResult = { fileId, totalItems: parsed.items.length, ran: 0, ok: 0, failed: 0 };

  for (const it of pending) {
    if (opts.cancelSignal?.aborted) break;
    if (opts.maxItems != null && result.ran >= opts.maxItems) break;

    const itemDb = upsertTaskItem({
      fileId, lineNo: it.lineNo, description: it.description,
      agentName: it.agent ?? opts.defaultAgent ?? 'briefing',
      modelName: it.model ?? opts.defaultModel,
      verifyCmd: it.verify ?? null,
      status: 'in_progress',
    });
    setTaskItemStatus(itemDb, 'in_progress', true);
    try { setItemStatusInFile(abs, it.lineNo, 'in_progress'); } catch { /* */ }
    mp.emit({ queue: queueName, level: 'info', kind: 'item_start', payload: { lineNo: it.lineNo, description: it.description, agent: it.agent, model: it.model, verify: it.verify } });

    const runId = startTaskRun({ itemId: itemDb });
    result.ran++;

    if (opts.dryRun) {
      mp.emit({ queue: queueName, level: 'info', kind: 'item_end', payload: { lineNo: it.lineNo, dryRun: true } });
      finishTaskRun({ runId, exitCode: 0, verifyExitCode: null, stdoutTail: '', stderrTail: '', outcome: 'ok' });
      setTaskItemStatus(itemDb, 'pending');
      try { setItemStatusInFile(abs, it.lineNo, 'pending'); } catch { /* */ }
      result.ok++;
      continue;
    }

    const agentName = it.agent ?? opts.defaultAgent ?? 'briefing';
    const agentResult = await runItemWithAgent(agentName, it.model ?? opts.defaultModel, it.description, mp, queueName, it.lineNo);

    let verifyCode: number | null = null;
    let verifyOk = true;
    let stdoutTail = tail(agentResult.assistantText);
    let stderrTail = agentResult.errMsg ?? '';

    if (agentResult.ok && it.verify) {
      const v = await runVerify(it.verify);
      verifyCode = v.code;
      verifyOk = v.code === 0;
      stdoutTail = tail(stdoutTail + '\n--- verify stdout ---\n' + v.stdout);
      stderrTail = tail(stderrTail + '\n--- verify stderr ---\n' + v.stderr);
      mp.emit({ queue: queueName, level: verifyOk ? 'info' : 'warn', kind: 'item_verify', payload: { lineNo: it.lineNo, exit: verifyCode } });
    }

    const success = agentResult.ok && verifyOk;
    const newStatus: ItemStatus = success ? 'completed' : 'failed';
    finishTaskRun({
      runId,
      exitCode: agentResult.ok ? 0 : 1,
      verifyExitCode: verifyCode,
      stdoutTail,
      stderrTail,
      outcome: success ? 'ok' : (agentResult.ok ? 'verify_failed' : 'failed'),
    });
    setTaskItemStatus(itemDb, newStatus);
    try { setItemStatusInFile(abs, it.lineNo, newStatus); } catch { /* */ }
    if (success) {
      result.ok++;
      mp.emit({ queue: queueName, level: 'info', kind: 'item_end', payload: { lineNo: it.lineNo, ok: true } });
    } else {
      result.failed++;
      mp.emit({ queue: queueName, level: 'error', kind: 'item_failed', payload: { lineNo: it.lineNo, errMsg: agentResult.errMsg, verifyCode } });
    }
  }

  mp.emit({ queue: queueName, level: 'info', kind: 'queue_end', payload: { ...result } });
  return result;
}
