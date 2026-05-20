import { ToolSpec } from '../agents/types.js';
import { confidencialReaderTool } from './confidencial_reader.js';
import { readFileTool } from './read_file.js';
import { httpGetTool } from './http_get.js';
import { shellSandboxTool } from './shell_sandbox.js';

export const TOOL_FACTORIES: Record<string, ToolSpec> = {
  [confidencialReaderTool.name]: confidencialReaderTool,
  [readFileTool.name]: readFileTool,
  [httpGetTool.name]: httpGetTool,
  [shellSandboxTool.name]: shellSandboxTool,
};

export { confidencialReaderTool, readFileTool, httpGetTool, shellSandboxTool };
