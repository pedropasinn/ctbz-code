import React, { useEffect, useRef, useState } from 'react';
import { Box, useApp, useInput, useStdin } from 'ink';
import { Banner } from './components/Banner.js';
import { Messages, Message } from './components/Messages.js';
import { PromptBox } from './components/PromptBox.js';
import { StatusBar } from './components/StatusBar.js';
import { providers, ProviderId, NativeProvider } from './lib/providers.js';
import { runProvider, runLogin } from './lib/runner.js';
import './lib/agents/index.js'; // bootstrap REGISTRY
import { REGISTRY, listAgents } from './lib/agents/registry.js';
import { ChatMessage } from './lib/agents/types.js';
import { parseTaskFile, runQueueFile, Multiplexer, FunctionChannel, defaultFileChannelFor } from './lib/queue/index.js';
import { listTaskFiles, listTaskItems, newSession, addMessage } from './lib/state.js';
import { runObservatory, formatObservatoryReport } from './lib/observatory/index.js';
import { CTBZ_HOME, WORK_DIR, CONFIDENCIAL_DIR, TASKS_DIR, STATE_DB } from './lib/paths.js';
import { DEFAULT_MODEL, MAX_HISTORY_TURNS } from './lib/constants.js';
import path from 'node:path';

const helpText = [
  'comandos:',
  '  /use <ctbz|claude|gemini|codex|agy>   troca o provedor ativo',
  '  /agent <name>                         troca o agente nativo (provider ctbz)',
  '  /agents                               lista agentes nativos disponíveis',
  '  /model <id|reset>                     troca/reseta o modelo do agente atual',
  '  /models                               lista modelos sugeridos',
  '  /login <provedor>                     autentica num provedor externo',
  '  /providers                            lista provedores',
  '  /queue list                           lista filas conhecidas',
  '  /queue run <file>                     executa items pendentes de uma fila',
  '  /queue show <file>                    mostra items parseados',
  '  /mentions [dry]                       roda Mentions Observatory',
  '  /state                                mostra paths/config',
  '  /clear                                limpa histórico',
  '  /help                                 esta ajuda',
  '  /exit                                 sair',
  '',
  'qualquer outro texto é enviado ao provedor ativo.',
].join('\n');

const DEFAULT_PROVIDER: ProviderId = 'ctbz';

function capHistory(h: ChatMessage[]): ChatMessage[] {
  const maxMessages = MAX_HISTORY_TURNS * 2;
  if (h.length <= maxMessages) return h;
  return h.slice(-maxMessages);
}

export const App: React.FC = () => {
  const { exit } = useApp();
  const { setRawMode } = useStdin();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<ProviderId>(DEFAULT_PROVIDER);
  const [agentName, setAgentName] = useState<string>(
    (providers[DEFAULT_PROVIDER] as NativeProvider).defaultAgent,
  );
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'system',
      content: `Sessão iniciada. Provedor: ${providers[DEFAULT_PROVIDER].label} · agente: ${(providers[DEFAULT_PROVIDER] as NativeProvider).defaultAgent}. Use /help para ver comandos.`,
    },
  ]);

  // Persistência de sessão em SQLite (~/.ctbz/state.db). Falha silenciosa
  // se o DB não puder ser inicializado — não bloqueia a TUI.
  const sessionIdRef = useRef<number | null>(null);
  useEffect(() => {
    try {
      const model = modelOverride ?? REGISTRY[agentName]?.model_name ?? DEFAULT_MODEL;
      sessionIdRef.current = newSession(agentName, model);
    } catch {
      sessionIdRef.current = null;
    }
    // intencionalmente sem deps: cria 1 sessão por execução da TUI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const persistMessage = (role: 'user' | 'assistant' | 'system', content: string) => {
    const sid = sessionIdRef.current;
    if (sid == null || !content) return;
    try { addMessage(sid, role, content); } catch { /* DB offline — ok */ }
  };

  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') exit();
  });

  const append = (m: Message) => setMessages((prev) => [...prev, m]);
  const sys = (content: string) => append({ role: 'system', content });

  const handleSubmit = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setInput('');

    // ---- slash commands ----
    if (text.startsWith('/')) {
      const [cmd, ...rest] = text.slice(1).split(/\s+/);
      const arg = rest.join(' ').trim();

      if (cmd === 'exit' || cmd === 'quit') return exit();
      if (cmd === 'clear')  { setMessages([]); setHistory([]); return; }
      if (cmd === 'help')   return sys(helpText);

      if (cmd === 'providers') {
        const list = Object.values(providers)
          .map(p => `  ${p.id === active ? '●' : '○'} ${p.id.padEnd(8)} ${p.label}`)
          .join('\n');
        return sys('provedores:\n' + list);
      }

      if (cmd === 'use') {
        if (!(arg in providers)) return sys(`provedor desconhecido: ${arg}`);
        setActive(arg as ProviderId);
        const p = providers[arg as ProviderId];
        if (p.kind === 'native') setAgentName(p.defaultAgent);
        return sys(`ativo: ${p.label}${p.kind === 'native' ? ` · agente: ${p.defaultAgent}` : ''}`);
      }

      if (cmd === 'agents') {
        const list = listAgents()
          .map((a) => `  ${a.name === agentName ? '●' : '○'} ${a.name.padEnd(20)} ${a.description}`)
          .join('\n');
        return sys('agentes nativos:\n' + (list || '  (nenhum registrado)'));
      }

      if (cmd === 'models') {
        return sys([
          'modelos sugeridos:',
          '  claude-opus-4-7              caro, mais inteligente, mais sujeito a rate-limit',
          '  claude-sonnet-4-6            balanceado (recomendado p/ uso diário)',
          '  claude-haiku-4-5-20251001    barato e rápido, ótimo p/ testes',
          '',
          `atual: ${modelOverride ?? (REGISTRY[agentName]?.model_name ?? DEFAULT_MODEL)} (agente ${agentName})`,
        ].join('\n'));
      }

      if (cmd === 'model') {
        if (!arg) {
          return sys(`atual: ${modelOverride ?? (REGISTRY[agentName]?.model_name ?? DEFAULT_MODEL)}. Use /model <id> ou /model reset.`);
        }
        if (arg === 'reset' || arg === 'default') {
          setModelOverride(null);
          return sys(`modelo resetado para o default do agente (${REGISTRY[agentName]?.model_name ?? DEFAULT_MODEL}).`);
        }
        setModelOverride(arg);
        return sys(`modelo override = ${arg} (vale para o provider ctbz nesta sessão).`);
      }

      if (cmd === 'agent') {
        if (!arg) return sys(`uso: /agent <name>. disponíveis: ${Object.keys(REGISTRY).join(', ')}`);
        if (!REGISTRY[arg]) return sys(`agente desconhecido: ${arg}. disponíveis: ${Object.keys(REGISTRY).join(', ')}`);
        setAgentName(arg);
        // mudar de agente também troca o provider pro ctbz native
        if (providers[active].kind !== 'native') setActive('ctbz');
        return sys(`agente: ${arg}`);
      }

      if (cmd === 'state') {
        return sys(
          [
            `CTBZ_HOME         = ${CTBZ_HOME}`,
            `WORK_DIR          = ${WORK_DIR}`,
            `CONFIDENCIAL_DIR  = ${CONFIDENCIAL_DIR}`,
            `TASKS_DIR         = ${TASKS_DIR}`,
            `STATE_DB          = ${STATE_DB}`,
            `platform          = ${process.platform}`,
          ].join('\n'),
        );
      }

      if (cmd === 'queue') {
        const [sub, ...subArgs] = arg.split(/\s+/);
        if (sub === 'list' || !sub) {
          const files = listTaskFiles();
          if (files.length === 0) return sys('(nenhuma fila registrada)');
          const lines = files.map((f) => {
            const items = listTaskItems(f.id);
            const by = items.reduce<Record<string, number>>((a, it) => { a[it.status] = (a[it.status] || 0) + 1; return a; }, {});
            return `  #${f.id} ${path.basename(f.path)} · ${items.length} items · ${Object.entries(by).map(([k, v]) => `${k}=${v}`).join(' ')}`;
          });
          return sys('filas:\n' + lines.join('\n'));
        }
        if (sub === 'show') {
          const p = subArgs.join(' ').trim();
          if (!p) return sys('uso: /queue show <file>');
          try {
            const parsed = parseTaskFile(path.resolve(WORK_DIR, p));
            const lines = parsed.items.map((it) => {
              const m = { pending: '[ ]', completed: '[x]', failed: '[!]', in_progress: '[~]' }[it.status];
              return `  L${it.lineNo} ${m} ${it.description}`;
            });
            return sys((parsed.title ? `# ${parsed.title}\n` : '') + lines.join('\n'));
          } catch (err: any) {
            return sys(`erro: ${err?.message ?? err}`);
          }
        }
        if (sub === 'run') {
          const restArgs = subArgs.join(' ').trim();
          if (!restArgs) return sys('uso: /queue run <file> [dry]');
          const dry = restArgs.includes(' dry') || restArgs.endsWith(' dry');
          const filePath = restArgs.replace(/\s+dry$/, '').trim();
          const abs = path.resolve(WORK_DIR, filePath);
          sys(`▶ rodando fila ${path.basename(abs)}${dry ? ' (dry)' : ''}…`);
          setBusy(true);
          const fileCh = defaultFileChannelFor(path.basename(abs, '.md'));
          const mp = new Multiplexer([
            fileCh,
            new FunctionChannel((ev) => {
              if (ev.kind === 'item_start') sys(`▶ L${(ev.payload as any).lineNo}: ${(ev.payload as any).description}`);
              else if (ev.kind === 'item_tool_start') sys(`  · tool ${(ev.payload as any).name} ⟳`);
              else if (ev.kind === 'item_tool_end') sys(`  · tool ${(ev.payload as any).name} ${(ev.payload as any).ok ? '✓' : '✗'} ${(ev.payload as any).elapsed_ms}ms`);
              else if (ev.kind === 'item_end') sys(`✓ L${(ev.payload as any).lineNo}`);
              else if (ev.kind === 'item_failed') sys(`✗ L${(ev.payload as any).lineNo}: ${(ev.payload as any).errMsg ?? ''}`);
              else if (ev.kind === 'queue_end') sys(`queue_end: ${JSON.stringify(ev.payload)}`);
            }),
          ]);
          runQueueFile(abs, mp, { dryRun: dry })
            .then((r) => { sys(`fim: ran=${r.ran} ok=${r.ok} failed=${r.failed}`); setBusy(false); })
            .catch((e) => { sys(`erro: ${e?.message ?? e}`); setBusy(false); });
          return;
        }
        return sys(`queue: ação desconhecida '${sub}'. use list|show|run.`);
      }

      if (cmd === 'mentions') {
        const dry = arg.includes('dry');
        sys(`▶ Mentions Observatory${dry ? ' (dry)' : ''}…`);
        setBusy(true);
        runObservatory({
          dry,
          onProgress: (ev) => {
            if (ev.kind === 'error') sys(`  ✗ ${ev.promptId}/${ev.clientId}: ${ev.err}`);
            else if (ev.kind === 'score_done') sys(`  ✓ ${ev.promptId}/${ev.clientId}`);
          },
        })
          .then((r) => { sys(formatObservatoryReport(r)); setBusy(false); })
          .catch((e) => { sys(`erro: ${e?.message ?? e}`); setBusy(false); });
        return;
      }

      if (cmd === 'login') {
        const id = (arg || active) as ProviderId;
        if (!(id in providers)) return sys(`provedor desconhecido: ${id}`);
        sys(`iniciando login em ${providers[id].label}... (vou ceder o terminal)`);
        try {
          // libera o terminal pro processo filho desenhar/abrir browser
          setRawMode?.(false);
          const code = await runLogin(providers[id]);
          setRawMode?.(true);
          sys(code === 0
            ? `login concluído em ${providers[id].label}.`
            : `login terminou com código ${code}.`);
        } catch (err: any) {
          setRawMode?.(true);
          sys(`erro no login: ${err?.message ?? String(err)}`);
        }
        return;
      }

      return sys(`comando desconhecido: /${cmd}`);
    }

    // ---- prompt normal: roteia pro provedor ativo ----
    append({ role: 'user', content: text });
    persistMessage('user', text);
    setBusy(true);
    const provider = providers[active];
    const providerLabel = provider.kind === 'native'
      ? `${provider.label} (${agentName})`
      : provider.label;

    append({ role: 'assistant', content: '', pending: true, providerLabel });

    let acc = '';
    runProvider(provider, text, {
      onChunk: (t) => {
        acc += t;
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant') {
            copy[copy.length - 1] = { ...last, content: acc, pending: false };
          }
          return copy;
        });
      },
      onError: (msg) => {
        append({ role: 'system', content: `[stderr ${active}] ${msg.trim()}` });
      },
      onToolStart: (name, preview) => {
        append({ role: 'system', content: `· tool ${name} ⟳  ${preview}` });
      },
      onToolEnd: (name, preview, ok, ms) => {
        const mark = ok ? '✓' : '✗';
        append({ role: 'system', content: `· tool ${name} ${mark} ${ms}ms — ${preview}` });
      },
      onDone: (code) => {
        setBusy(false);
        if (code !== 0 && !acc) {
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = {
              role: 'system',
              content: `${active} terminou com código ${code} (sem saída). Verifique se está logado: /login ${active}`,
            };
            return copy;
          });
          return;
        }
        if (acc) {
          persistMessage('assistant', acc);
          setHistory((prev) => capHistory([
            ...prev,
            { role: 'user', content: text },
            { role: 'assistant', content: acc },
          ]));
        }
      },
    }, provider.kind === 'native' ? { agentName, history, modelName: modelOverride ?? undefined } : undefined);
  };

  // Wrapper para garantir que erros async no handleSubmit virem mensagens
  // de sistema em vez de unhandled promise rejections silenciosos.
  const onSubmitSafe = (raw: string) => {
    handleSubmit(raw).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      sys(`erro inesperado: ${msg}`);
      setBusy(false);
    });
  };

  const statusMode = providers[active].kind === 'native'
    ? `provedor: ${providers[active].label} · agente: ${agentName}${modelOverride ? ` · modelo: ${modelOverride}` : ''}`
    : `provedor: ${providers[active].label}`;

  return (
    <Box flexDirection="column" padding={1}>
      <Banner />
      <Messages items={messages} />
      <PromptBox
        value={input}
        onChange={setInput}
        onSubmit={onSubmitSafe}
        disabled={busy}
      />
      <StatusBar cwd={process.cwd()} mode={statusMode} />
    </Box>
  );
};
