// Smoke não-rede: valida que REGISTRY tem 'briefing', tools resolvem e o bridge
// é construível (sem chamar API). Mata sinal verde do parser do runner via "ok".
import '../../src/lib/agents/index.js';
import { REGISTRY } from '../../src/lib/agents/registry.js';
import { TOOL_FACTORIES } from '../../src/lib/tools/index.js';
import { providers } from '../../src/lib/providers.js';

const errs: string[] = [];

if (!REGISTRY.briefing) errs.push('briefing não está em REGISTRY');
if (REGISTRY.briefing && !REGISTRY.briefing.tools.includes('read_confidencial'))
  errs.push("briefing não declara tool 'read_confidencial'");
if (!TOOL_FACTORIES.read_confidencial) errs.push('read_confidencial não está em TOOL_FACTORIES');

const ctbz = providers.ctbz;
if (ctbz.kind !== 'native') errs.push("providers.ctbz não é kind='native'");
if (ctbz.kind === 'native' && ctbz.defaultAgent !== 'briefing')
  errs.push(`providers.ctbz.defaultAgent != 'briefing' (got ${ctbz.kind === 'native' ? ctbz.defaultAgent : '?'})`);

// AnthropicBridge deve falhar sem env (em ambiente CI sem token), mas import deve dar certo
import('../../src/lib/native/anthropic_bridge.js')
  .then((m) => {
    if (!m.AgentBridge) errs.push('AgentBridge não exportado');
    if (errs.length) {
      console.error('FAIL:\n  - ' + errs.join('\n  - '));
      process.exit(1);
    }
    console.log('ok d4_shape');
  })
  .catch((e: unknown) => {
    console.error('import anthropic_bridge falhou:', e);
    process.exit(2);
  });
