import React from 'react';
import { render } from 'ink';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { App } from './App.js';

export function runTui(): void {
  render(<App />);
}

// Detecção robusta de execução direta (cross-platform, lida com symlinks).
function isMain(): boolean {
  if (!process.argv[1]) return false;
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMain()) runTui();
