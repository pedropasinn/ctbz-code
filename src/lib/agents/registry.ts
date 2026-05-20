import { AgentSpec } from './types.js';

export const REGISTRY: Record<string, AgentSpec> = {};

export function registerAgent(spec: AgentSpec): void {
  REGISTRY[spec.name] = spec;
}

export function listAgents(): AgentSpec[] {
  return Object.values(REGISTRY).sort((a, b) => a.name.localeCompare(b.name));
}
