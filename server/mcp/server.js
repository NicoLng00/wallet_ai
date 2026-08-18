import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { technicalAgentTool } from './tools/technicalAgent.js';
import { riskManagerAgentTool } from './tools/riskManagerAgent.js';
import { fundamentalAgentTool } from './tools/fundamentalAgent.js';
import { hedgeAgentTool } from './tools/hedgeAgent.js';
import { marketRegimeAgentTool } from './tools/marketRegimeAgent.js';
import { liquidityAgentTool, auditSentinelAgentTool } from './tools/unavailableAgents.js';

// I 7 agenti come tool MCP reali. Ognuno restituisce lo stesso contratto strutturato
// descritto in ARCHITECTURE.md (available/thesis/confidence/evidence/risk_flags/model_version).
const AGENT_TOOLS = [
  technicalAgentTool,
  riskManagerAgentTool,
  marketRegimeAgentTool,
  liquidityAgentTool,
  fundamentalAgentTool,
  hedgeAgentTool,
  auditSentinelAgentTool
];

export function createAgentMcpServer() {
  const server = new McpServer({ name: 'aurora-agents', version: '0.1.0' });
  AGENT_TOOLS.forEach((tool) => {
    server.registerTool(tool.name, tool.config, async (args) => {
      const result = await tool.handler(args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    });
  });
  return server;
}

export const AGENT_TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.name);
