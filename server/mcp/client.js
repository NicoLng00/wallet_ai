import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAgentMcpServer } from './server.js';

let clientPromise = null;

// Server e client MCP vivono nello stesso processo Node, collegati da un InMemoryTransport —
// protocollo MCP reale (handshake, JSON-RPC, tool discovery/call), senza bisogno di un
// processo separato o di stdio piping.
async function connectClient() {
  const server = createAgentMcpServer();
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'aurora-supervisor', version: '0.1.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function getClient() {
  if (!clientPromise) clientPromise = connectClient();
  return clientPromise;
}

export async function callAgentTool(name, args) {
  const client = await getClient();
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) {
    const text = result.content?.[0]?.text || 'Errore sconosciuto dal tool MCP.';
    throw new Error(`Tool MCP "${name}" ha restituito un errore: ${text}`);
  }
  return result.structuredContent;
}
