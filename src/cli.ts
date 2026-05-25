// CLI standalone do ctbz-code com subcomandos.
//
// Uso:
//   ctbz-code                       → abre a TUI
//   ctbz-code agent briefing -q "…"
//   ctbz-code queue list
//   ctbz-code queue run ctbz_tasks/foo.md [--dry] [--max=3]
//   ctbz-code queue show <file>
//   ctbz-code observatory run [--dry]
//   ctbz-code observatory report
//   ctbz-code state path
//
// `meow` faz parsing leve; pra TUI delegamos pra src/index.tsx via require dinâmico.

import meow from 'meow';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import './lib/agents/index.js';
import { REGISTRY } from './lib/agents/registry.js';
import { TOOL_FACTORIES } from './lib/tools/index.js';
import { AgentBridge } from './lib/native/anthropic_bridge.js';
import { parseTaskFile, runQueueFile, Multiplexer, FunctionChannel, defaultFileChannelFor } from './lib/queue/index.js';
import { runObservatory, formatObservatoryReport } from './lib/observatory/index.js';
import { listMentionsRuns, listTaskFiles, listTaskItems } from './lib/state.js';
import { CTBZ_HOME, STATE_DB, WORK_DIR, CONFIDENCIAL_DIR, TASKS_DIR } from './lib/paths.js';

const cli = meow(
  `
Usage
  $ ctbz-code [subcommand] [options]

Subcommands
  (none)              Abre a TUI
  agent <name>        Roda um agente nativo headless
  queue list          Lista filas conhecidas (do SQLite)
  queue show <file>   Mostra items parseados de uma fila
  queue run <file>    Executa items pendentes da fila
  observatory run     Sonda os 4 LLMs com os 20 prompts e escora
  observatory report  Mostra report da última semana de runs
  state               Mostra paths/config

Options
  -q, --query "…"     Pergunta pro agente (modo agent)
  --dry               Modo dry-run (não chama LLMs, não modifica nada)
  --max N             Máx de items por fila
  -h, --help          Ajuda
  -V, --version       Versão
`,
  {
    importMeta: import.meta,
    booleanDefault: undefined,
    flags: {
      query: { type: 'string', shortFlag: 'q' },
      dry: { type: 'boolean' },
      max: { type: 'number' },
    },
  },
);

async function cmdAgent(name: string, query: string) {
  const spec = REGISTRY[name];
  if (!spec) {
    console.error(`agente '${name}' não registrado. Disponíveis: ${Object.keys(REGISTRY).join(', ')}`);
    process.exit(1);
  }
  const bridge = AgentBridge.fromEnv(spec.model_name);
  for (const t of spec.tools) {
    const tf = TOOL_FACTORIES[t];
    if (tf) bridge.registerTool(tf);
  }
  for await (const ev of bridge.stream(spec, query, [])) {
    if (ev.type === 'text') process.stdout.write(ev.text);
    else if (ev.type === 'tool_use') process.stderr.write(`\n[tool] ${ev.tool_name} ⟳ ${JSON.stringify(ev.tool_input).slice(0, 120)}\n`);
    else if (ev.type === 'tool_result') process.stderr.write(`[tool] ${ev.tool_name} ${ev.tool_ok ? '✓' : '✗'} ${ev.elapsed_ms}ms\n`);
    else if (ev.type === 'error') { console.error(`\nerro: ${ev.error}`); process.exit(1); }
    else if (ev.type === 'done') { process.stdout.write('\n'); return; }
  }
}

async function cmdQueueRun(filePath: string) {
  const abs = path.resolve(filePath);
  if (!existsSync(abs)) {
    console.error(`arquivo não encontrado: ${abs}`);
    process.exit(1);
  }
  const queueName = path.basename(abs, '.md');
  const file = defaultFileChannelFor(queueName);
  const stdoutChan = new FunctionChannel((ev) => {
    if (ev.kind === 'item_start') console.error(`▶ L${(ev.payload as { lineNo: number }).lineNo}: ${(ev.payload as { description: string }).description}`);
    else if (ev.kind === 'item_text') process.stdout.write((ev.payload as { delta: string }).delta);
    else if (ev.kind === 'item_tool_start') console.error(`  [tool] ${(ev.payload as { name: string }).name} ⟳`);
    else if (ev.kind === 'item_tool_end') console.error(`  [tool] ${(ev.payload as { name: string; ok: boolean; elapsed_ms: number }).name} ${(ev.payload as { ok: boolean }).ok ? '✓' : '✗'} ${(ev.payload as { elapsed_ms: number }).elapsed_ms}ms`);
    else if (ev.kind === 'item_verify') console.error(`  verify exit=${(ev.payload as { exit: number }).exit}`);
    else if (ev.kind === 'item_end') console.error(`✓ L${(ev.payload as { lineNo: number }).lineNo}\n`);
    else if (ev.kind === 'item_failed') console.error(`✗ L${(ev.payload as { lineNo: number; errMsg?: string }).lineNo}: ${(ev.payload as { errMsg?: string }).errMsg ?? ''}\n`);
    else if (ev.kind === 'queue_end') console.error(`\n--- queue_end: ${JSON.stringify(ev.payload)}`);
  });
  const mp = new Multiplexer([file, stdoutChan]);
  const r = await runQueueFile(abs, mp, { dryRun: cli.flags.dry, maxItems: cli.flags.max });
  if (r.failed > 0) process.exit(2);
}

function cmdQueueShow(filePath: string) {
  const abs = path.resolve(filePath);
  const parsed = parseTaskFile(abs);
  console.log(`# ${parsed.title ?? path.basename(abs)}`);
  console.log(`items: ${parsed.items.length}`);
  for (const it of parsed.items) {
    const m = { pending: '[ ]', completed: '[x]', failed: '[!]', in_progress: '[~]' }[it.status];
    const ann: string[] = [];
    if (it.agent) ann.push(`agent=${it.agent}`);
    if (it.model) ann.push(`model=${it.model}`);
    if (it.verify) ann.push(`verify="${it.verify}"`);
    console.log(`  L${it.lineNo} ${m} ${it.description}${ann.length ? '  (' + ann.join(' ') + ')' : ''}`);
  }
}

function cmdQueueList() {
  const files = listTaskFiles();
  if (files.length === 0) { console.log('(nenhuma fila registrada — rode `queue run` ou `queue show` primeiro)'); return; }
  for (const f of files) {
    console.log(`  #${f.id} ${f.path}  (${f.total_items} items)`);
    const items = listTaskItems(f.id);
    const by = items.reduce<Record<string, number>>((a, it) => { a[it.status] = (a[it.status] || 0) + 1; return a; }, {});
    console.log(`        ${Object.entries(by).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  }
}

async function cmdObservatoryRun() {
  console.error('Iniciando Mentions Observatory…');
  const r = await runObservatory({
    dry: cli.flags.dry,
    onProgress: (ev) => {
      if (ev.kind === 'error') console.error(`  ✗ ${ev.promptId}/${ev.clientId}: ${ev.err}`);
      else if (ev.kind === 'score_done') console.error(`  ✓ ${ev.promptId}/${ev.clientId}`);
    },
  });
  const report = formatObservatoryReport(r);
  console.log(report);
  // grava em site_observatory/<yyyy-ww>.md
  const week = (() => {
    const d = new Date(r.date);
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = Math.floor((d.getTime() - start.getTime()) / (24 * 3600 * 1000));
    const w = Math.ceil((diff + start.getDay() + 1) / 7);
    return `${d.getFullYear()}-${String(w).padStart(2, '0')}`;
  })();
  const outDir = path.join(WORK_DIR, 'site_observatory');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${week}.md`);
  writeFileSync(outPath, report, 'utf8');
  console.error(`\nReport gravado em ${outPath}`);
}

function cmdObservatoryReport() {
  const rows = listMentionsRuns();
  if (rows.length === 0) { console.log('(nenhum run gravado — rode `observatory run` primeiro)'); return; }
  const byDate: Record<string, number> = {};
  for (const r of rows) byDate[r.run_date] = (byDate[r.run_date] || 0) + 1;
  console.log('runs por data:');
  for (const [d, n] of Object.entries(byDate).sort()) console.log(`  ${d}: ${n}`);
}

function cmdState() {
  console.log(`CTBZ_HOME           = ${CTBZ_HOME}`);
  console.log(`WORK_DIR            = ${WORK_DIR}`);
  console.log(`CONFIDENCIAL_DIR    = ${CONFIDENCIAL_DIR}`);
  console.log(`TASKS_DIR           = ${TASKS_DIR}`);
  console.log(`STATE_DB            = ${STATE_DB}`);
  console.log(`platform            = ${process.platform}`);
}

async function main() {
  const [sub, ...rest] = cli.input;
  if (!sub) {
    const mod = await import('./index.js');
    if (typeof (mod as { runTui?: () => void }).runTui === 'function') (mod as { runTui: () => void }).runTui();
    return;
  }
  switch (sub) {
    case 'agent': {
      const name = rest[0];
      const query = cli.flags.query;
      if (!name || !query) { console.error('uso: agent <name> -q "…"'); process.exit(2); }
      return cmdAgent(name, query);
    }
    case 'queue': {
      const action = rest[0];
      if (action === 'list') return cmdQueueList();
      if (action === 'show') {
        if (!rest[1]) { console.error('uso: queue show <file.md>'); process.exit(2); }
        return cmdQueueShow(rest[1]);
      }
      if (action === 'run') {
        if (!rest[1]) { console.error('uso: queue run <file.md> [--dry] [--max=N]'); process.exit(2); }
        return cmdQueueRun(rest[1]);
      }
      console.error(`queue: ação desconhecida '${action}'`); process.exit(2);
      return;
    }
    case 'observatory': {
      const action = rest[0];
      if (action === 'run') return cmdObservatoryRun();
      if (action === 'report') return cmdObservatoryReport();
      console.error(`observatory: ação desconhecida '${action}'`); process.exit(2);
      return;
    }
    case 'state':
      return cmdState();
    default:
      console.error(`subcomando desconhecido: ${sub}`);
      console.error(cli.help);
      process.exit(2);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
