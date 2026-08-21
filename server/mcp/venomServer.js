import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { technicalAgentTool } from './tools/technicalAgent.js';
import { riskManagerAgentTool } from './tools/riskManagerAgent.js';
import { marketRegimeAgentTool } from './tools/marketRegimeAgent.js';
import { liquidityModelAgentTool } from './tools/liquidityModelAgent.js';
import { hedgeAgentTool } from './tools/hedgeAgent.js';
import { auditSentinelAgentTool } from './tools/unavailableAgents.js';
import { venomNewsAgentTool } from './tools/venomNewsAgent.js';
import { venomCalendarAgentTool } from './tools/venomCalendarAgent.js';

// Server MCP gemello di server.js, tool set diverso per la pipeline venom: gli agenti generici
// (nessuna assunzione specifica su SpiderMan) sono RIUSATI as-is — technical_analyst, risk_manager,
// market_regime, hedge, audit_sentinel. fundamental/social_sentiment/macro_calendar (Finnhub-based,
// non copre i 13 ticker europei, confermato con una chiave reale) sono sostituiti da venom_news e
// venom_calendar (entrambi Google News RSS, stessa infrastruttura verificata). liquidity_model e'
// la versione REALE (non il placeholder liquidityAgentTool del sistema principale) — stesso
// identico contratto.
const VENOM_AGENT_TOOLS = [
  technicalAgentTool,
  riskManagerAgentTool,
  marketRegimeAgentTool,
  liquidityModelAgentTool,
  hedgeAgentTool,
  auditSentinelAgentTool,
  venomNewsAgentTool,
  venomCalendarAgentTool
];

export function createVenomAgentMcpServer() {
  const server = new McpServer({ name: 'aurora-venom-agents', version: '0.1.0' });
  VENOM_AGENT_TOOLS.forEach((tool) => {
    server.registerTool(tool.name, tool.config, async (args) => {
      const result = await tool.handler(args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    });
  });
  return server;
}

export const VENOM_AGENT_TOOL_NAMES = VENOM_AGENT_TOOLS.map((tool) => tool.name);
