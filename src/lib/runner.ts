import { spawn, SpawnOptions } from 'node:child_process';
import { NativeProvider, Provider, SpawnProvider } from './providers.js';
import './agents/index.js'; // bootstrap REGISTRY (importa briefing)
import { REGISTRY } from './agents/registry.js';
import { TOOL_FACTORIES } from './tools/index.js';
import { AgentBridge } from './native/anthropic_bridge.js';
import { ChatMessage } from './agents/types.js';
import { DEFAULT_MODEL } from './constants.js';

export interface RunCallbacks {
  onChunk: (text: string) => void;
  onError: (msg: string) => void;
  onDone: (exitCode: number) => void;
  onToolStart?: (toolName: string, inputPreview: string) => void;
  onToolEnd?: (toolName: string, outputPreview: string, ok: boolean, elapsedMs: number) => void;
}

export interface RunContext {
  agentName?: string;
  modelName?: string;
  history?: ChatMessage[];
}

export interface RunHandle {
  cancel: () => void;
}

export function runProvider(
  provider: Provider,
  prompt: string,
  cb: RunCallbacks,
  ctx?: RunContext,
): RunHandle {
  if (provider.kind === 'native') {
    return runNativeAgent(provider, prompt, cb, ctx);
  }
  return runSpawnProvider(provider, prompt, cb);
}

function runSpawnProvider(provider: SpawnProvider, prompt: string, cb: RunCallbacks): RunHandle {
  const args = provider.buildArgs(prompt);
  const child = spawn(provider.bin, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });

  let buf = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const parsed = provider.parseChunk(line);
      if (parsed) cb.onChunk(parsed);
    }
  });
  child.stderr.on('data', (chunk: Buffer) => cb.onError(chunk.toString('utf8')));
  child.on('close', (code) => {
    if (buf.length) {
      const parsed = provider.parseChunk(buf);
      if (parsed) cb.onChunk(parsed);
    }
    cb.onDone(code ?? 0);
  });
  child.on('error', (err) => {
    cb.onError(
      err.message.includes('ENOENT')
        ? `'${provider.bin}' não está instalado ou não está no PATH.`
        : err.message,
    );
    cb.onDone(1);
  });

  return { cancel: () => child.kill('SIGTERM') };
}

function runNativeAgent(
  provider: NativeProvider,
  prompt: string,
  cb: RunCallbacks,
  ctx?: RunContext,
): RunHandle {
  const agentName = ctx?.agentName ?? provider.defaultAgent;
  const spec = REGISTRY[agentName];
  if (!spec) {
    cb.onError(`agente '${agentName}' não registrado. Disponíveis: ${Object.keys(REGISTRY).join(', ')}`);
    cb.onDone(1);
    return { cancel: () => {} };
  }

  const abortCtrl = new AbortController();
  (async () => {
    let bridge: AgentBridge;
    try {
      bridge = AgentBridge.fromEnv(ctx?.modelName ?? spec.model_name ?? DEFAULT_MODEL);
    } catch (e: unknown) {
      cb.onError(e instanceof Error ? e.message : String(e));
      cb.onDone(1);
      return;
    }
    for (const tname of spec.tools) {
      const tool = TOOL_FACTORIES[tname];
      if (tool) bridge.registerTool(tool);
    }

    try {
      for await (const ev of bridge.stream(spec, prompt, ctx?.history ?? [], { signal: abortCtrl.signal })) {
        if (abortCtrl.signal.aborted) return;
        if (ev.type === 'text') cb.onChunk(ev.text);
        else if (ev.type === 'tool_use') {
          cb.onToolStart?.(ev.tool_name, JSON.stringify(ev.tool_input).slice(0, 120));
        } else if (ev.type === 'tool_result') {
          cb.onToolEnd?.(ev.tool_name, ev.tool_result.slice(0, 80), ev.tool_ok, ev.elapsed_ms);
        } else if (ev.type === 'error') {
          cb.onError(ev.error);
        } else if (ev.type === 'done') {
          cb.onDone(0);
          return;
        }
      }
      cb.onDone(0);
    } catch (e: unknown) {
      cb.onError(e instanceof Error ? e.message : String(e));
      cb.onDone(1);
    }
  })();

  return { cancel: () => abortCtrl.abort() };
}

export function runLogin(provider: Provider): Promise<number> {
  return new Promise((resolve, reject) => {
    if (provider.kind === 'native') return resolve(0);
    if (!provider.loginArgs.length) return resolve(0);
    const opts: SpawnOptions = { stdio: 'inherit', shell: false };
    const child = spawn(provider.bin, provider.loginArgs, opts);
    child.on('close', (code) => resolve(code ?? 0));
    child.on('error', reject);
  });
}
