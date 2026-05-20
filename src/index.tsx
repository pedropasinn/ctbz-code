import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

export function runTui(): void {
  render(<App />);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop() ?? '')) {
  // executed directly (tsx src/index.tsx)
  runTui();
}
