// Smoke: garante que importar App + index.tsx + cli não quebra em runtime.
// (Não renderiza — só testa o lado do módulo.)
await import('../../src/App.js');
await import('../../src/index.js');
// cli.ts não — ele tem efeito colateral de meow + main()
console.log('ok d12_tui_imports');
