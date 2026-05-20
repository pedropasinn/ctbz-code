// Smoke live: chama o briefing agent contra Haiku com um prompt curto,
// valida que sai pelo menos 1 evento text. Não exige tool_call.
// Custo: <$0.01. Skipa se não tiver auth.

import '../../src/lib/agents/index.js';
import { REGISTRY } from '../../src/lib/agents/registry.js';
import { TOOL_FACTORIES } from '../../src/lib/tools/index.js';
import { AgentBridge } from '../../src/lib/native/anthropic_bridge.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function hasAuth(): boolean {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true;
  return fs.existsSync(path.join(os.homedir(), '.claude', '.credentials.json'));
}

async function main() {
  if (!hasAuth()) {
    console.log('ok d4_bridge_live (skipped: sem auth)');
    return;
  }

  const bridge = AgentBridge.fromEnv('claude-haiku-4-5-20251001');
  bridge.registerTool(TOOL_FACTORIES.read_confidencial);
  const spec = REGISTRY.briefing;

  let textCount = 0;
  let done = false;
  let errMsg = '';
  const t0 = Date.now();

  for await (const ev of bridge.stream(
    spec,
    'Em uma linha só, escreva "ping" sem chamar nenhuma tool.',
    [],
  )) {
    if (ev.type === 'text') textCount++;
    else if (ev.type === 'error') errMsg = ev.error;
    else if (ev.type === 'done') {
      done = true;
      break;
    }
    if (Date.now() - t0 > 60_000) {
      errMsg = 'timeout 60s';
      break;
    }
  }

  if (errMsg) { console.error('FAIL: erro do bridge:', errMsg); process.exit(1); }
  if (!done) { console.error('FAIL: stream não emitiu done'); process.exit(1); }
  if (textCount === 0) { console.error('FAIL: 0 eventos de text'); process.exit(1); }

  console.log(`ok d4_bridge_live · text_events=${textCount} elapsed=${Date.now() - t0}ms`);
}

main().catch((e: unknown) => {
  console.error('FAIL (throw):', e);
  process.exit(1);
});
