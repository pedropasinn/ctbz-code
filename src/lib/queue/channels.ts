// Channels: sinks para eventos de execução de tasks.
// Cada channel é um adapter — TUI, log local NDJSON, Discord webhook, etc.
// Default: log NDJSON em $CTBZ_HOME/channels/<fila>.ndjson + stdout.

import fs from 'node:fs';
import path from 'node:path';
import { CHANNELS_DIR, ensureDir } from '../paths.js';

export interface QueueEvent {
  ts: string;
  queue: string;
  level: 'info' | 'warn' | 'error';
  kind:
    | 'queue_start' | 'queue_end'
    | 'item_start' | 'item_text' | 'item_tool_start' | 'item_tool_end'
    | 'item_end' | 'item_verify' | 'item_failed';
  payload: Record<string, unknown>;
}

export interface Channel {
  name: string;
  emit(ev: QueueEvent): void | Promise<void>;
}

export class FileChannel implements Channel {
  readonly name = 'file';
  private fh: fs.WriteStream | null = null;
  constructor(private filePath: string) {}
  ensureOpen(): void {
    if (this.fh) return;
    ensureDir(path.dirname(this.filePath));
    this.fh = fs.createWriteStream(this.filePath, { flags: 'a' });
  }
  emit(ev: QueueEvent): void {
    this.ensureOpen();
    this.fh!.write(JSON.stringify(ev) + '\n');
  }
  close(): void {
    if (this.fh) { try { this.fh.end(); } catch { /* */ } this.fh = null; }
  }
}

export class FunctionChannel implements Channel {
  readonly name = 'fn';
  constructor(private fn: (ev: QueueEvent) => void) {}
  emit(ev: QueueEvent): void { try { this.fn(ev); } catch { /* never throw */ } }
}

export class Multiplexer {
  constructor(public channels: Channel[]) {}
  emit(ev: Omit<QueueEvent, 'ts'>): void {
    const stamped: QueueEvent = { ts: new Date().toISOString(), ...ev };
    for (const c of this.channels) {
      try {
        const r = c.emit(stamped);
        if (r instanceof Promise) r.catch(() => { /* */ });
      } catch { /* never propagate */ }
    }
  }
}

export function defaultFileChannelFor(queueName: string): FileChannel {
  ensureDir(CHANNELS_DIR);
  const safe = queueName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new FileChannel(path.join(CHANNELS_DIR, `${safe}.ndjson`));
}
